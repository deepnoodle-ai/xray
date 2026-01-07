// Core exports - framework agnostic

// Browser utilities
export {
  captureScreenshot,
  clickElement,
  createXrayScope,
  executeAction,
  executeFunction,
  fillInput,
  getAccessibilityInfo,
  getActions,
  getFocusInfo,
  getFunctions,
  getPerformanceMetrics,
  getStorageInfo,
  getViewportInfo,
  goBack,
  goForward,
  navigate,
  queryDom,
  refresh,
  registerAction,
  registerFunction,
  scrollTo,
  unregisterAction,
  unregisterFunction,
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
  XrayFunction,
  XrayScope,
  XrayState,
} from './types.js'
