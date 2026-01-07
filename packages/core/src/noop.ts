/**
 * No-op implementations for production builds.
 * These provide properly typed stubs that satisfy the real API signatures.
 */

import type {
  DomQueryResult,
  FocusInfo,
  PerformanceMetrics,
  StorageInfo,
  ViewportInfo,
  XrayAction,
  XrayCollector,
  XrayConfig,
  XrayState,
} from './types.js'

// Empty state that matches XrayState interface
const emptyState: XrayState = {
  timestamp: '',
  url: '',
  route: '',
  title: '',
  registered: {},
  errors: [],
  warnings: [],
  console: [],
  network: [],
}

// No-op collector that satisfies XrayCollector interface
const noopCollector: XrayCollector = {
  getState: () => emptyState,
  registerState: () => {},
  unregisterState: () => {},
  addError: () => {},
  addConsole: () => {},
  addNetwork: () => {},
  updateNetwork: () => {},
  clear: () => {},
}

// Core utilities (no-op)
export function createCollector(_config?: XrayConfig): XrayCollector {
  return noopCollector
}

export function getCollector(): XrayCollector | null {
  return null
}

export function setCollector(_collector: XrayCollector): void {
  // no-op
}

export function setupInterceptors(
  _collector: XrayCollector,
  _config?: XrayConfig,
): () => void {
  return () => {}
}

// Browser utilities (no-op)
const emptyDomQueryResult: DomQueryResult = {
  found: false,
  count: 0,
  html: null,
  text: null,
  attributes: null,
  boundingRect: null,
  visible: false,
}

export function queryDom(
  _selector: string,
  _options?: { includeStyles?: boolean; all?: boolean },
): DomQueryResult | DomQueryResult[] {
  return emptyDomQueryResult
}

export function captureScreenshot(): Promise<string | null> {
  return Promise.resolve(null)
}

export function getViewportInfo(): ViewportInfo {
  return { width: 0, height: 0, scrollX: 0, scrollY: 0, devicePixelRatio: 1 }
}

export function getPerformanceMetrics(): PerformanceMetrics {
  return {
    domContentLoaded: null,
    loadComplete: null,
    usedJSHeapSize: null,
    totalJSHeapSize: null,
    renderCount: 0,
  }
}

export function getStorageInfo(): StorageInfo {
  return { localStorage: {}, sessionStorage: {} }
}

export function getFocusInfo(): FocusInfo {
  return {
    activeElement: null,
    activeElementId: null,
    activeElementClasses: [],
  }
}

export function getAccessibilityInfo(
  _selector?: string,
): Record<string, unknown> {
  return {}
}

export function clickElement(_selector: string): {
  success: boolean
  error?: string
} {
  return { success: false, error: 'noop' }
}

export function fillInput(
  _selector: string,
  _value: string,
): { success: boolean; error?: string } {
  return { success: false, error: 'noop' }
}

export function scrollTo(_target: string | { x: number; y: number }): {
  success: boolean
  error?: string
} {
  return { success: false, error: 'noop' }
}

export function navigate(
  _url: string,
  _options?: { replace?: boolean },
): { success: boolean; error?: string } {
  return { success: false, error: 'noop' }
}

export function refresh(_options?: { hard?: boolean }): {
  success: boolean
  error?: string
} {
  return { success: false, error: 'noop' }
}

export function goBack(): { success: boolean; error?: string } {
  return { success: false, error: 'noop' }
}

export function goForward(): { success: boolean; error?: string } {
  return { success: false, error: 'noop' }
}

export function registerAction(_action: XrayAction): void {
  // no-op
}

export function unregisterAction(_name: string): void {
  // no-op
}

export function getActions(): XrayAction[] {
  return []
}

export function executeAction(
  _name: string,
  _args?: unknown[],
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  return Promise.resolve({ success: false, error: 'noop' })
}

// Re-export types (these have no runtime cost)
export type {
  AssertionResult,
  ConsoleEntry,
  DomQueryResult,
  FocusInfo,
  NetworkRequest,
  PerformanceMetrics,
  RegisteredState,
  StorageInfo,
  ViewportInfo,
  XrayAction,
  XrayCollector,
  XrayConfig,
  XrayError,
  XrayState,
} from './types.js'
