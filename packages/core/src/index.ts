// Core exports - framework agnostic

// Browser utilities
export {
  captureScreenshot,
  clickElement,
  executeAction,
  fillInput,
  getAccessibilityInfo,
  getActions,
  getFocusInfo,
  getPerformanceMetrics,
  getStorageInfo,
  getViewportInfo,
  goBack,
  goForward,
  navigate,
  queryDom,
  refresh,
  registerAction,
  scrollTo,
  unregisterAction,
} from './browser.js'
export { createCollector, getCollector, setCollector } from './collector.js'
export { setupInterceptors } from './interceptors.js'
export type { SafeSerializeOptions } from './serializer.js'
export { safeSerialize, safeStringify } from './serializer.js'

// Types
export type {
  AssertionResult,
  BoundingRect,
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
