// Svelte bindings for xray

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
} from 'xray-core'

// Re-export core types and utilities for convenience
export {
  captureScreenshot,
  clickElement,
  createCollector,
  executeAction,
  fillInput,
  getAccessibilityInfo,
  getActions,
  getCollector,
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
  setCollector,
  setupInterceptors,
  unregisterAction,
} from 'xray-core'
export {
  getXrayCollector,
  initXray,
  registerState,
  registerXrayAction,
  trackStore,
  unregisterState,
  type XrayOptions,
} from './store.js'
