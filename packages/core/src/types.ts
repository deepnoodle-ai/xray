export interface ConsoleEntry {
  level: "log" | "warn" | "error" | "info" | "debug";
  message: string;
  timestamp: number;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  status: number | null;
  duration: number | null;
  timestamp: number;
  error?: string;
  // Headers (redacted by default)
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  // Bodies (opt-in, JSON only, size-limited)
  requestBody?: unknown;
  responseBody?: unknown;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
}

export interface XrayError {
  message: string;
  stack?: string;
  timestamp: number;
  componentStack?: string;
}

export interface RegisteredState {
  name: string;
  state: unknown;
  updatedAt: number;
}

export interface XrayState {
  // Metadata
  timestamp: string;
  url: string;
  route: string;
  title: string;

  // Registered state (from useXray hooks)
  registered: Record<string, RegisteredState>;

  // Automatic captures
  errors: XrayError[];
  warnings: string[];
  console: ConsoleEntry[];
  network: NetworkRequest[];
}

export interface AssertionResult {
  passed: boolean;
  assertion: string;
  details: Record<string, unknown>;
  hint?: string;
}

export interface XrayCollector {
  getState(): XrayState;
  registerState(name: string, state: unknown): void;
  unregisterState(name: string): void;
  addError(error: XrayError): void;
  addConsole(entry: ConsoleEntry): void;
  addNetwork(request: NetworkRequest): void;
  updateNetwork(id: string, updates: Partial<NetworkRequest>): void;
  clear(): void;
}

export interface XrayAction {
  name: string;
  description?: string;
  handler: (...args: unknown[]) => unknown | Promise<unknown>;
}

export interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  devicePixelRatio: number;
}

export interface PerformanceMetrics {
  // Navigation timing
  domContentLoaded: number | null;
  loadComplete: number | null;
  // Memory (Chrome only)
  usedJSHeapSize: number | null;
  totalJSHeapSize: number | null;
  // React-specific (if available)
  renderCount: number;
}

export interface StorageInfo {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface FocusInfo {
  activeElement: string | null;
  activeElementId: string | null;
  activeElementClasses: string[];
}

export interface DomQueryResult {
  found: boolean;
  count: number;
  html: string | null;
  text: string | null;
  attributes: Record<string, string> | null;
  boundingRect: DOMRect | null;
  visible: boolean;
  computedStyles?: Record<string, string>;
}

export interface XrayConfig {
  /** Port for the HTTP API (default: 9876) */
  port?: number;
  /** Maximum console entries to keep (default: 100) */
  maxConsoleEntries?: number;
  /** Maximum network requests to keep (default: 50) */
  maxNetworkEntries?: number;
  /** Maximum errors to keep (default: 50) */
  maxErrors?: number;
  /** Capture request/response headers (default: true) */
  captureHeaders?: boolean;
  /** Capture request/response bodies - JSON only (default: false) */
  captureBodies?: boolean;
  /** Maximum body size in bytes before truncation (default: 10240 = 10KB) */
  maxBodySize?: number;
  /** Header names to redact (default: ['authorization', 'cookie', 'set-cookie', 'x-api-key']) */
  redactHeaders?: string[];
  /** JSON field names to redact in bodies (default: ['password', 'token', 'secret', 'apiKey', 'api_key']) */
  redactBodyFields?: string[];
}
