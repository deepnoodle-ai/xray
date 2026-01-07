import type {
  ConsoleEntry,
  NetworkRequest,
  RegisteredState,
  XrayCollector,
  XrayConfig,
  XrayError,
  XrayState,
} from './types.js'

const DEFAULT_CONFIG: Omit<Required<XrayConfig>, 'secret'> = {
  port: 9876,
  maxConsoleEntries: 100,
  maxNetworkEntries: 50,
  maxErrors: 50,
  captureHeaders: true,
  captureBodies: false,
  maxBodySize: 10240, // 10KB
  redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
  redactBodyFields: ['password', 'token', 'secret', 'apiKey', 'api_key'],
}

export function createCollector(config: XrayConfig = {}): XrayCollector {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  const registered = new Map<string, RegisteredState>()
  const errors: XrayError[] = []
  const warnings: string[] = []
  const consoleEntries: ConsoleEntry[] = []
  const networkRequests: NetworkRequest[] = []

  function trimArray<T>(arr: T[], max: number): void {
    while (arr.length > max) {
      arr.shift()
    }
  }

  return {
    getState(): XrayState {
      return {
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : '',
        route: typeof window !== 'undefined' ? window.location.pathname : '',
        title: typeof document !== 'undefined' ? document.title : '',
        registered: Object.fromEntries(registered),
        errors: [...errors],
        warnings: [...warnings],
        console: [...consoleEntries],
        network: [...networkRequests],
      }
    },

    registerState(name: string, state: unknown): void {
      registered.set(name, {
        name,
        state,
        updatedAt: Date.now(),
      })
    },

    unregisterState(name: string): void {
      registered.delete(name)
    },

    addError(error: XrayError): void {
      errors.push(error)
      trimArray(errors, cfg.maxErrors)
    },

    addConsole(entry: ConsoleEntry): void {
      consoleEntries.push(entry)
      trimArray(consoleEntries, cfg.maxConsoleEntries)

      // Also track warnings separately for quick access
      if (entry.level === 'warn') {
        warnings.push(entry.message)
        trimArray(warnings, cfg.maxErrors)
      }
    },

    addNetwork(request: NetworkRequest): void {
      networkRequests.push(request)
      trimArray(networkRequests, cfg.maxNetworkEntries)
    },

    updateNetwork(id: string, updates: Partial<NetworkRequest>): void {
      const request = networkRequests.find((r) => r.id === id)
      if (request) {
        Object.assign(request, updates)
      }
    },

    clear(): void {
      registered.clear()
      errors.length = 0
      warnings.length = 0
      consoleEntries.length = 0
      networkRequests.length = 0
    },
  }
}

// Singleton for the browser
let globalCollector: XrayCollector | null = null

export function getCollector(): XrayCollector | null {
  return globalCollector
}

export function setCollector(collector: XrayCollector | null): void {
  globalCollector = collector
}
