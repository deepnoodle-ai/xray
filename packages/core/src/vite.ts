import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import type { AssertionResult, XrayState } from './types.js'

/** Default max request body size: 1MB */
const _DEFAULT_MAX_REQUEST_BODY_SIZE = 1048576

interface XrayPluginOptions {
  /** Port for the API (uses Vite's port, endpoints at /xray/*) */
  enabled?: boolean
  /** Maximum request body size in bytes (default: 1MB = 1048576 bytes) */
  maxRequestBodySize?: number
  /**
   * Shared secret for authenticating /xray/* endpoint requests.
   * When set, all public endpoints require either:
   * - X-Xray-Secret header with matching value
   * - ?secret= query parameter with matching value
   * When not set (default), no authentication is required.
   */
  secret?: string
}

// State is pushed from the browser via a special endpoint
let currentState: XrayState | null = null

// Command queue for browser execution
interface PendingCommand {
  id: string
  command: string
  args: unknown[]
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

const pendingCommands = new Map<string, PendingCommand>()
const _commandResults = new Map<string, unknown>()

function queueCommand(
  command: string,
  args: unknown[] = [],
  timeoutMs = 5000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    const timeout = setTimeout(() => {
      pendingCommands.delete(id)
      reject(new Error(`Command "${command}" timed out`))
    }, timeoutMs)

    pendingCommands.set(id, { id, command, args, resolve, reject, timeout })
  })
}

function getPendingCommands(): Array<{
  id: string
  command: string
  args: unknown[]
}> {
  return Array.from(pendingCommands.values()).map(({ id, command, args }) => ({
    id,
    command,
    args,
  }))
}

function resolveCommand(id: string, result: unknown, error?: string): void {
  const pending = pendingCommands.get(id)
  if (pending) {
    clearTimeout(pending.timeout)
    pendingCommands.delete(id)
    if (error) {
      pending.reject(new Error(error))
    } else {
      pending.resolve(result)
    }
  }
}

/**
 * Validates the request against the configured secret.
 * Returns true if authentication passes, false otherwise.
 * When no secret is configured, always returns true.
 */
function checkAuth(
  req: IncomingMessage,
  configuredSecret: string | undefined,
): boolean {
  // No secret configured = no auth required
  if (!configuredSecret) {
    return true
  }

  // Check X-Xray-Secret header first
  const headerSecret = req.headers['x-xray-secret']
  if (headerSecret === configuredSecret) {
    return true
  }

  // Check ?secret= query parameter
  const url = new URL(req.url ?? '', 'http://localhost')
  const querySecret = url.searchParams.get('secret')
  if (querySecret === configuredSecret) {
    return true
  }

  return false
}

/**
 * Sends a 401 Unauthorized response
 */
function sendUnauthorized(res: ServerResponse): void {
  res.statusCode = 401
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      error: 'Unauthorized',
      message:
        'Missing or invalid secret. Provide X-Xray-Secret header or ?secret= query parameter.',
    }),
  )
}

/**
 * Reads request body with size limit protection.
 * Checks Content-Length header first, then enforces limit during streaming.
 * Returns null if size limit exceeded (response already sent with 413).
 */
function readBodyWithLimit(
  req: IncomingMessage,
  res: ServerResponse,
  maxSize: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    // Check Content-Length header first
    const contentLength = req.headers['content-length']
    if (contentLength) {
      const declaredSize = parseInt(contentLength, 10)
      if (!Number.isNaN(declaredSize) && declaredSize > maxSize) {
        res.statusCode = 413
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'Payload Too Large',
            maxSize,
            declaredSize,
          }),
        )
        resolve(null)
        return
      }
    }

    // Stream body with size limit enforcement
    let body = ''
    let receivedSize = 0
    let aborted = false

    req.on('data', (chunk: Buffer) => {
      if (aborted) return

      receivedSize += chunk.length
      if (receivedSize > maxSize) {
        aborted = true
        res.statusCode = 413
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'Payload Too Large',
            maxSize,
            receivedSize,
          }),
        )
        // Destroy the request to stop receiving more data
        req.destroy()
        resolve(null)
        return
      }

      body += chunk.toString()
    })

    req.on('end', () => {
      if (!aborted) {
        resolve(body)
      }
    })

    req.on('error', () => {
      if (!aborted) {
        aborted = true
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Request error' }))
        resolve(null)
      }
    })
  })
}

export function xrayPlugin(options: XrayPluginOptions = {}): Plugin {
  const {
    enabled = true,
    secret,
    maxRequestBodySize = _DEFAULT_MAX_REQUEST_BODY_SIZE,
  } = options

  if (!enabled) {
    return { name: 'react-xray' }
  }

  // Second layer of defense: strict environment check
  // This safeguards against accidental inclusion in production builds
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[xray] Warning: xray plugin detected in production environment. ' +
        'Disabling xray endpoints for security. ' +
        'Remove xrayPlugin from your production Vite config.',
    )
    return { name: 'react-xray' }
  }

  return {
    name: 'react-xray',
    apply: 'serve', // Only in dev mode

    configureServer(server: ViteDevServer) {
      // Endpoint for browser to push state
      server.middlewares.use(
        '/xray/__push',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          const body = await readBodyWithLimit(req, res, maxRequestBodySize)
          if (body === null) return // Response already sent (413 or error)

          try {
            currentState = JSON.parse(body)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 400
            res.end('Invalid JSON')
          }
        },
      )

      // GET /xray/state - Full state dump
      server.middlewares.use(
        '/xray/state',
        (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (!currentState) {
            res.end(
              JSON.stringify({
                error: 'No state available. Is XrayProvider mounted?',
              }),
            )
            return
          }

          res.end(JSON.stringify(currentState, null, 2))
        },
      )

      // GET /xray/query - Filtered queries
      server.middlewares.use(
        '/xray/query',
        (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (!currentState) {
            res.end(JSON.stringify({ error: 'No state available' }))
            return
          }

          const url = new URL(req.url ?? '', 'http://localhost')
          const select = url.searchParams.get('select')
          const component = url.searchParams.get('component')
          const limit = parseInt(url.searchParams.get('limit') ?? '0', 10)

          let result: Record<string, unknown> = {}

          if (component) {
            // Query specific component/registered state
            const registered = currentState.registered[component]
            if (registered) {
              result = { [component]: registered }
            } else {
              result = { error: `Component "${component}" not found` }
            }
          } else if (select) {
            // Select specific fields
            const fields = select.split(',').map((f) => f.trim())
            for (const field of fields) {
              if (field in currentState) {
                let value = currentState[field as keyof XrayState]
                if (limit > 0 && Array.isArray(value)) {
                  value = value.slice(-limit)
                }
                result[field] = value
              }
            }
          } else {
            // Return summary
            result = {
              url: currentState.url,
              route: currentState.route,
              registeredCount: Object.keys(currentState.registered).length,
              errorCount: currentState.errors.length,
              warningCount: currentState.warnings.length,
              consoleCount: currentState.console.length,
              networkCount: currentState.network.length,
            }
          }

          res.end(JSON.stringify(result, null, 2))
        },
      )

      // GET /xray/assert - Make assertions
      server.middlewares.use(
        '/xray/assert',
        (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (!currentState) {
            res.end(JSON.stringify({ error: 'No state available' }))
            return
          }

          const url = new URL(req.url ?? '', 'http://localhost')
          const params = Object.fromEntries(url.searchParams.entries())

          const result = evaluateAssertion(currentState, params)
          res.end(JSON.stringify(result, null, 2))
        },
      )

      // GET /xray/errors - Quick error check
      server.middlewares.use(
        '/xray/errors',
        (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (!currentState) {
            res.end(JSON.stringify({ error: 'No state available' }))
            return
          }

          const hasErrors = currentState.errors.length > 0
          res.end(
            JSON.stringify({
              hasErrors,
              count: currentState.errors.length,
              errors: currentState.errors,
            }),
          )
        },
      )

      // GET /xray/clear - Clear captured state
      server.middlewares.use(
        '/xray/clear',
        (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (currentState) {
            currentState.errors = []
            currentState.warnings = []
            currentState.console = []
            currentState.network = []
          }

          res.end(JSON.stringify({ ok: true, message: 'State cleared' }))
        },
      )

      // GET /xray/__commands - Browser polls for pending commands
      server.middlewares.use(
        '/xray/__commands',
        (_req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(getPendingCommands()))
        },
      )

      // POST /xray/__result - Browser sends command results
      server.middlewares.use(
        '/xray/__result',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          const body = await readBodyWithLimit(req, res, maxRequestBodySize)
          if (body === null) return // Response already sent (413 or error)

          try {
            const { id, result, error } = JSON.parse(body)
            resolveCommand(id, result, error)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.statusCode = 400
            res.end('Invalid JSON')
          }
        },
      )

      // GET /xray/dom - Query DOM elements
      server.middlewares.use(
        '/xray/dom',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          const url = new URL(req.url ?? '', 'http://localhost')
          const selector = url.searchParams.get('selector')
          const includeStyles = url.searchParams.get('styles') === 'true'
          const all = url.searchParams.get('all') === 'true'

          if (!selector) {
            res.end(JSON.stringify({ error: 'Missing selector parameter' }))
            return
          }

          try {
            const result = await queueCommand('queryDom', [
              selector,
              { includeStyles, all },
            ])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // GET /xray/screenshot - Capture screenshot
      server.middlewares.use(
        '/xray/screenshot',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Access-Control-Allow-Origin', '*')

          try {
            const result = await queueCommand('captureScreenshot', [], 10000)
            if (result) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ screenshot: result }))
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  error:
                    'Screenshot capture not available. Add html2canvas to your project.',
                  hint: "npm install html2canvas, then add: window.html2canvas = (await import('html2canvas')).default",
                }),
              )
            }
          } catch (err) {
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // GET /xray/actions - List available actions
      server.middlewares.use(
        '/xray/actions',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          try {
            const result = await queueCommand('getActions', [])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // POST /xray/action - Execute a registered action
      server.middlewares.use(
        '/xray/action',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }))
            return
          }

          const body = await readBodyWithLimit(req, res, maxRequestBodySize)
          if (body === null) return // Response already sent (413 or error)

          try {
            const { name, args = [] } = JSON.parse(body)
            if (!name) {
              res.end(JSON.stringify({ error: 'Missing action name' }))
              return
            }

            const result = await queueCommand('executeAction', [name, args])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // POST /xray/click - Click an element
      server.middlewares.use(
        '/xray/click',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          const url = new URL(req.url ?? '', 'http://localhost')
          const selector = url.searchParams.get('selector')

          if (!selector) {
            res.end(JSON.stringify({ error: 'Missing selector parameter' }))
            return
          }

          try {
            const result = await queueCommand('clickElement', [selector])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // POST /xray/fill - Fill an input
      server.middlewares.use(
        '/xray/fill',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (req.method !== 'POST') {
            // Also support GET for simple cases
            const url = new URL(req.url ?? '', 'http://localhost')
            const selector = url.searchParams.get('selector')
            const value = url.searchParams.get('value')

            if (!selector || value === null) {
              res.end(
                JSON.stringify({
                  error: 'Missing selector or value parameter',
                }),
              )
              return
            }

            try {
              const result = await queueCommand('fillInput', [selector, value])
              res.end(JSON.stringify(result, null, 2))
            } catch (err) {
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                }),
              )
            }
            return
          }

          const body = await readBodyWithLimit(req, res, maxRequestBodySize)
          if (body === null) return // Response already sent (413 or error)

          try {
            const { selector, value } = JSON.parse(body)
            if (!selector || value === undefined) {
              res.end(JSON.stringify({ error: 'Missing selector or value' }))
              return
            }

            const result = await queueCommand('fillInput', [selector, value])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // GET /xray/diagnostics - Extended diagnostics
      server.middlewares.use(
        '/xray/diagnostics',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          try {
            const [viewport, performance, storage, focus, a11y] =
              await Promise.all([
                queueCommand('getViewportInfo', []),
                queueCommand('getPerformanceMetrics', []),
                queueCommand('getStorageInfo', []),
                queueCommand('getFocusInfo', []),
                queueCommand('getAccessibilityInfo', []),
              ])

            res.end(
              JSON.stringify(
                {
                  viewport,
                  performance,
                  storage,
                  focus,
                  accessibility: a11y,
                },
                null,
                2,
              ),
            )
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // GET /xray/a11y - Accessibility info
      server.middlewares.use(
        '/xray/a11y',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          const url = new URL(req.url ?? '', 'http://localhost')
          const selector = url.searchParams.get('selector') || undefined

          try {
            const result = await queueCommand('getAccessibilityInfo', [
              selector,
            ])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // POST /xray/navigate - Navigate to a URL
      server.middlewares.use(
        '/xray/navigate',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          const url = new URL(req.url ?? '', 'http://localhost')
          const targetUrl = url.searchParams.get('url')
          const replace = url.searchParams.get('replace') === 'true'

          if (!targetUrl) {
            res.end(JSON.stringify({ error: 'Missing url parameter' }))
            return
          }

          try {
            const result = await queueCommand('navigate', [
              targetUrl,
              { replace },
            ])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // POST /xray/refresh - Refresh the page
      server.middlewares.use(
        '/xray/refresh',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          try {
            const result = await queueCommand('refresh', [])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // POST /xray/back - Go back in history
      server.middlewares.use(
        '/xray/back',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          try {
            const result = await queueCommand('goBack', [])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // POST /xray/forward - Go forward in history
      server.middlewares.use(
        '/xray/forward',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          try {
            const result = await queueCommand('goForward', [])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // GET /xray/functions - List registered functions
      server.middlewares.use(
        '/xray/functions',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          try {
            const result = await queueCommand('getFunctions', [])
            res.end(JSON.stringify({ functions: result }, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // GET/POST /xray/call/* - Call a registered function
      server.middlewares.use(
        '/xray/call/',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          // Extract function name from path: /xray/call/foo.bar -> foo.bar
          const url = new URL(req.url ?? '', 'http://localhost')
          const fullPath = url.pathname
          const fnName = fullPath.replace(/^\/xray\/call\//, '')

          if (!fnName) {
            res.end(
              JSON.stringify({
                error: 'Missing function name. Use /xray/call/<name>',
              }),
            )
            return
          }

          let args: unknown[] = []

          // For POST requests, parse args from body
          if (req.method === 'POST') {
            const body = await readBodyWithLimit(req, res, maxRequestBodySize)
            if (body === null) return // Response already sent (413 or error)

            try {
              const parsed = JSON.parse(body)
              args = Array.isArray(parsed.args) ? parsed.args : []
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON body' }))
              return
            }
          }

          try {
            const result = await queueCommand('executeFunction', [fnName, args])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      // GET /xray/scroll - Scroll to element or position
      server.middlewares.use(
        '/xray/scroll',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (!checkAuth(req, secret)) {
            sendUnauthorized(res)
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')

          const url = new URL(req.url ?? '', 'http://localhost')
          const selector = url.searchParams.get('selector')
          const x = url.searchParams.get('x')
          const y = url.searchParams.get('y')

          let target: string | { x: number; y: number }
          if (selector) {
            target = selector
          } else if (x !== null && y !== null) {
            target = { x: parseInt(x, 10), y: parseInt(y, 10) }
          } else {
            res.end(
              JSON.stringify({ error: 'Missing selector or x,y parameters' }),
            )
            return
          }

          try {
            const result = await queueCommand('scrollTo', [target])
            res.end(JSON.stringify(result, null, 2))
          } catch (err) {
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            )
          }
        },
      )

      console.log('\n  🔬 react-xray endpoints available:')
      if (secret) {
        console.log(
          '     🔒 Authentication enabled (X-Xray-Secret header or ?secret= required)',
        )
      }
      console.log('     State & Query:')
      console.log('       GET  /xray/state       - Full state dump')
      console.log('       GET  /xray/query       - Filtered queries')
      console.log('       GET  /xray/errors      - Quick error check')
      console.log('       GET  /xray/clear       - Clear captured state')
      console.log('       GET  /xray/assert      - Make assertions')
      console.log('     DOM & Interaction:')
      console.log('       GET  /xray/dom         - Query DOM (selector=)')
      console.log('       GET  /xray/click       - Click element (selector=)')
      console.log(
        '       POST /xray/fill        - Fill input (selector=, value=)',
      )
      console.log('       GET  /xray/scroll      - Scroll to element/position')
      console.log('     Navigation:')
      console.log('       GET  /xray/navigate    - Navigate to URL (url=)')
      console.log('       GET  /xray/refresh     - Refresh the page')
      console.log('       GET  /xray/back        - Go back in history')
      console.log('       GET  /xray/forward     - Go forward in history')
      console.log('     Functions & Actions:')
      console.log('       GET  /xray/functions   - List registered functions')
      console.log('       GET  /xray/call/:name  - Call function (no args)')
      console.log('       POST /xray/call/:name  - Call function with args')
      console.log('       GET  /xray/actions     - List registered actions')
      console.log('       POST /xray/action      - Execute action (name=)')
      console.log('     Diagnostics:')
      console.log('       GET  /xray/screenshot  - Capture screenshot')
      console.log('       GET  /xray/diagnostics - Extended diagnostics')
      console.log('       GET  /xray/a11y        - Accessibility info\n')
    },

    // Inject client-side script to push state to server
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `
            // react-xray: Push state to dev server and poll for commands
            (function() {
              let pushing = false;
              let polling = false;

              // Safe serializer that handles BigInt, circular refs, etc.
              function safeSerialize(value, seen = new WeakSet(), depth = 0) {
                if (depth > 10) return '[Max Depth]';
                if (value === null) return null;
                if (value === undefined) return null;
                if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
                if (typeof value === 'bigint') return value.toString() + 'n';
                if (typeof value === 'function') return '[Function]';
                if (typeof value === 'symbol') return '[Symbol]';
                if (typeof value === 'object') {
                  if (seen.has(value)) return '[Circular]';
                  seen.add(value);
                  if (Array.isArray(value)) return value.map(v => safeSerialize(v, seen, depth + 1));
                  if (value instanceof Date) return value.toISOString();
                  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
                  if (value instanceof Map) {
                    const obj = {};
                    value.forEach((v, k) => { obj[String(k)] = safeSerialize(v, seen, depth + 1); });
                    return obj;
                  }
                  if (value instanceof Set) return Array.from(value).map(v => safeSerialize(v, seen, depth + 1));
                  const result = {};
                  for (const key of Object.keys(value)) {
                    try { result[key] = safeSerialize(value[key], seen, depth + 1); }
                    catch { result[key] = '[Unserializable]'; }
                  }
                  return result;
                }
                return '[Unknown]';
              }

              async function pushState() {
                if (pushing) return;
                if (!window.__XRAY_COLLECTOR__) return;

                pushing = true;
                try {
                  const state = window.__XRAY_COLLECTOR__.getState();
                  const serialized = safeSerialize(state);
                  await fetch('/xray/__push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serialized),
                  });
                } catch (e) {
                  // Ignore push errors
                } finally {
                  pushing = false;
                }
              }

              async function pollCommands() {
                if (polling) return;
                if (!window.__XRAY_BROWSER__) return;

                polling = true;
                try {
                  const res = await fetch('/xray/__commands');
                  const commands = await res.json();

                  for (const cmd of commands) {
                    const { id, command, args } = cmd;
                    let result, error;

                    try {
                      const fn = window.__XRAY_BROWSER__[command];
                      if (typeof fn === 'function') {
                        result = await fn(...args);
                      } else {
                        error = 'Command not found: ' + command;
                      }
                    } catch (e) {
                      error = e instanceof Error ? e.message : String(e);
                    }

                    // Send result back to server
                    await fetch('/xray/__result', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id, result, error }),
                    });
                  }
                } catch (e) {
                  // Ignore poll errors
                } finally {
                  polling = false;
                }
              }

              // Push state periodically and on changes
              setInterval(pushState, 500);
              window.addEventListener('error', () => setTimeout(pushState, 10));
              window.addEventListener('xray:ready', pushState);

              // Poll for commands frequently
              setInterval(pollCommands, 100);
            })();
          `,
          injectTo: 'body',
        },
      ]
    },
  }
}

function evaluateAssertion(
  state: XrayState,
  params: Record<string, string>,
): AssertionResult {
  const assertion = new URLSearchParams(params).toString()

  // Check for errors
  if ('errors' in params) {
    const expected = params.errors
    if (expected === 'empty') {
      return {
        passed: state.errors.length === 0,
        assertion,
        details: {
          expected: 'no errors',
          actual: state.errors.length,
          errors: state.errors,
        },
        hint:
          state.errors.length > 0
            ? `Found ${state.errors.length} error(s): ${state.errors[0]?.message}`
            : undefined,
      }
    }
  }

  // Check component state
  if ('component' in params) {
    const componentName = params.component
    const registered = state.registered[componentName]

    if (!registered) {
      return {
        passed: false,
        assertion,
        details: {
          expected: `component "${componentName}" to exist`,
          actual: 'not found',
          available: Object.keys(state.registered),
        },
        hint: `Component "${componentName}" is not registered. Available: ${Object.keys(state.registered).join(', ') || 'none'}`,
      }
    }

    // Check state properties
    const stateChecks = Object.entries(params).filter(
      ([key]) => key.startsWith('state.') || key === 'state',
    )

    if (stateChecks.length > 0) {
      for (const [key, expected] of stateChecks) {
        const path = key.replace('state.', '')
        const actual = getNestedValue(registered.state, path)
        const expectedValue = parseValue(expected)

        if (actual !== expectedValue) {
          return {
            passed: false,
            assertion,
            details: {
              component: componentName,
              path,
              expected: expectedValue,
              actual,
            },
            hint: `${componentName}.${path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expectedValue)}`,
          }
        }
      }
    }

    return {
      passed: true,
      assertion,
      details: {
        component: componentName,
        state: registered.state,
      },
    }
  }

  // Check route
  if ('route' in params) {
    const expected = params.route
    const passed = state.route === expected
    return {
      passed,
      assertion,
      details: {
        expected,
        actual: state.route,
      },
      hint: passed
        ? undefined
        : `Route is "${state.route}", expected "${expected}"`,
    }
  }

  // Check network
  if ('network' in params) {
    const status = params.status
    if (status) {
      const statusPattern = status.replace('xx', '\\d\\d')
      const regex = new RegExp(`^${statusPattern}$`)
      const matches = state.network.filter(
        (r) => r.status !== null && regex.test(r.status.toString()),
      )

      if (status.includes('5') || status.includes('4')) {
        // Looking for errors
        return {
          passed: matches.length === 0,
          assertion,
          details: {
            pattern: status,
            matches: matches.length,
            requests: matches,
          },
          hint:
            matches.length > 0
              ? `Found ${matches.length} request(s) with status ${status}`
              : undefined,
        }
      }
    }
  }

  return {
    passed: false,
    assertion,
    details: { error: 'Unknown assertion type' },
    hint: 'Supported: errors=empty, component=Name, route=/path, network with status',
  }
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (path === 'state' || path === '') return obj

  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

function parseValue(str: string): unknown {
  if (str === 'true') return true
  if (str === 'false') return false
  if (str === 'null') return null
  if (str === 'undefined') return undefined
  const num = Number(str)
  if (!Number.isNaN(num)) return num
  return str
}

export default xrayPlugin
