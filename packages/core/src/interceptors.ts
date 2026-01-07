import { safeStringify } from './serializer.js'
import type {
  ConsoleEntry,
  NetworkRequest,
  XrayCollector,
  XrayConfig,
} from './types.js'

let isIntercepting = false
let cleanupFns: Array<() => void> = []

// Default config values for interceptors
const DEFAULT_INTERCEPT_CONFIG = {
  captureHeaders: true,
  captureBodies: false,
  maxBodySize: 10240,
  redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
  redactBodyFields: ['password', 'token', 'secret', 'apiKey', 'api_key'],
}

function redactHeaders(
  headers: Record<string, string>,
  redactList: string[],
): Record<string, string> {
  const redacted: Record<string, string> = {}
  const lowerRedactList = redactList.map((h) => h.toLowerCase())
  for (const [key, value] of Object.entries(headers)) {
    if (lowerRedactList.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]'
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

function redactBodyFields(body: unknown, redactList: string[]): unknown {
  if (body === null || body === undefined) return body
  if (Array.isArray(body)) {
    return body.map((item) => redactBodyFields(item, redactList))
  }
  if (typeof body === 'object') {
    const redacted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(
      body as Record<string, unknown>,
    )) {
      if (redactList.includes(key)) {
        redacted[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactBodyFields(value, redactList)
      } else {
        redacted[key] = value
      }
    }
    return redacted
  }
  return body
}

function headersToObject(
  headers: HeadersInit | undefined,
): Record<string, string> {
  const result: Record<string, string> = {}
  if (!headers) return result

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value
    }
  } else {
    Object.assign(result, headers)
  }
  return result
}

export function setupInterceptors(
  collector: XrayCollector,
  config: XrayConfig = {},
): () => void {
  if (isIntercepting) {
    console.warn('[xray] Interceptors already set up')
    return () => {}
  }

  if (typeof window === 'undefined') {
    return () => {}
  }

  const cfg = { ...DEFAULT_INTERCEPT_CONFIG, ...config }
  isIntercepting = true
  cleanupFns = []

  // Intercept console
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  }

  const levels = ['log', 'warn', 'error', 'info', 'debug'] as const
  for (const level of levels) {
    console[level] = (...args: unknown[]) => {
      const entry: ConsoleEntry = {
        level,
        message: args.map((arg) => safeStringify(arg)).join(' '),
        timestamp: Date.now(),
      }
      collector.addConsole(entry)
      originalConsole[level](...args)
    }
  }

  cleanupFns.push(() => {
    for (const level of levels) {
      console[level] = originalConsole[level]
    }
  })

  // Intercept fetch
  const originalFetch = window.fetch
  window.fetch = async (input, init) => {
    const id = Math.random().toString(36).slice(2)
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const method = init?.method ?? 'GET'

    const request: NetworkRequest = {
      id,
      url,
      method: method.toUpperCase(),
      status: null,
      duration: null,
      timestamp: Date.now(),
    }

    // Capture request headers
    if (cfg.captureHeaders) {
      const rawHeaders = headersToObject(init?.headers)
      request.requestHeaders = redactHeaders(rawHeaders, cfg.redactHeaders)
    }

    // Capture request body (if enabled and JSON)
    if (cfg.captureBodies && init?.body) {
      try {
        let bodyStr: string | null = null
        if (typeof init.body === 'string') {
          bodyStr = init.body
        } else if (init.body instanceof URLSearchParams) {
          bodyStr = init.body.toString()
        }
        // Skip FormData, Blob, ArrayBuffer, etc.

        if (bodyStr !== null) {
          if (bodyStr.length > cfg.maxBodySize) {
            request.requestBody = bodyStr.slice(0, cfg.maxBodySize)
            request.requestBodyTruncated = true
          } else {
            // Try to parse as JSON for redaction
            try {
              const parsed = JSON.parse(bodyStr)
              request.requestBody = redactBodyFields(
                parsed,
                cfg.redactBodyFields,
              )
            } catch {
              // Not JSON, store as string
              request.requestBody = bodyStr
            }
          }
        }
      } catch {
        // Ignore body capture errors
      }
    }

    collector.addNetwork(request)

    const start = performance.now()
    try {
      const response = await originalFetch(input, init)
      const updates: Partial<NetworkRequest> = {
        status: response.status,
        duration: Math.round(performance.now() - start),
      }

      // Capture response headers
      if (cfg.captureHeaders) {
        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })
        updates.responseHeaders = redactHeaders(
          responseHeaders,
          cfg.redactHeaders,
        )
      }

      // Capture response body (if enabled and JSON content-type)
      if (cfg.captureBodies) {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          try {
            const cloned = response.clone()
            const text = await cloned.text()
            if (text.length > cfg.maxBodySize) {
              updates.responseBody = text.slice(0, cfg.maxBodySize)
              updates.responseBodyTruncated = true
            } else {
              try {
                const parsed = JSON.parse(text)
                updates.responseBody = redactBodyFields(
                  parsed,
                  cfg.redactBodyFields,
                )
              } catch {
                updates.responseBody = text
              }
            }
          } catch {
            // Ignore response body capture errors
          }
        }
      }

      collector.updateNetwork(id, updates)
      return response
    } catch (error) {
      collector.updateNetwork(id, {
        status: 0,
        duration: Math.round(performance.now() - start),
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  cleanupFns.push(() => {
    window.fetch = originalFetch
  })

  // Intercept global errors
  const errorHandler = (event: ErrorEvent) => {
    collector.addError({
      message: event.message,
      stack: event.error?.stack,
      timestamp: Date.now(),
    })
  }

  window.addEventListener('error', errorHandler)
  cleanupFns.push(() => {
    window.removeEventListener('error', errorHandler)
  })

  // Intercept unhandled promise rejections
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const error = event.reason
    collector.addError({
      message: error?.message ?? String(error),
      stack: error?.stack,
      timestamp: Date.now(),
    })
  }

  window.addEventListener('unhandledrejection', rejectionHandler)
  cleanupFns.push(() => {
    window.removeEventListener('unhandledrejection', rejectionHandler)
  })

  // Return cleanup function
  return () => {
    for (const cleanup of cleanupFns) {
      cleanup()
    }
    cleanupFns = []
    isIntercepting = false
  }
}
