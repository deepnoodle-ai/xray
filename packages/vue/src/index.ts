// Vue bindings for xray
export {
  xrayVuePlugin,
  getXrayCollector,
  cleanupXray,
  type XrayPluginOptions,
} from "./plugin.js";

export {
  useXray,
  useXrayCustom,
  useXrayAction,
  useXrayCollector,
} from "./composables.js";

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

// Default export for plugin
export { xrayVuePlugin as default } from "./plugin.js";
