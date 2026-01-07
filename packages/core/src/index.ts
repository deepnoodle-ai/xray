// Core exports - framework agnostic
export { createCollector, getCollector, setCollector } from "./collector.js";
export { setupInterceptors } from "./interceptors.js";

// Browser utilities
export {
  queryDom,
  captureScreenshot,
  getViewportInfo,
  getPerformanceMetrics,
  getStorageInfo,
  getFocusInfo,
  getAccessibilityInfo,
  clickElement,
  fillInput,
  scrollTo,
  navigate,
  refresh,
  goBack,
  goForward,
  registerAction,
  unregisterAction,
  getActions,
  executeAction,
} from "./browser.js";

// Types
export type {
  XrayState,
  XrayConfig,
  XrayCollector,
  XrayError,
  XrayAction,
  ConsoleEntry,
  NetworkRequest,
  RegisteredState,
  AssertionResult,
  ViewportInfo,
  PerformanceMetrics,
  DomQueryResult,
  StorageInfo,
  FocusInfo,
} from "./types.js";
