// Svelte bindings for xray
export {
  initXray,
  trackStore,
  registerState,
  unregisterState,
  registerXrayAction,
  getXrayCollector,
  type XrayOptions,
} from "./store.js";

// Re-export core types and utilities for convenience
export {
  createCollector,
  getCollector,
  setCollector,
  setupInterceptors,
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
} from "xray-core";

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
} from "xray-core";
