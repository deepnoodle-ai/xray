/**
 * No-op implementations for production builds.
 * These are completely empty and will be tree-shaken away.
 */

// Core utilities (no-op)
export function createCollector() {
  return null;
}

export function getCollector() {
  return null;
}

export function setCollector() {
  // no-op
}

export function setupInterceptors() {
  return () => {};
}

// Browser utilities (no-op)
export function queryDom() {
  return { found: false };
}

export function captureScreenshot() {
  return Promise.resolve(null);
}

export function getViewportInfo() {
  return { width: 0, height: 0, scrollX: 0, scrollY: 0, devicePixelRatio: 1 };
}

export function getPerformanceMetrics() {
  return {};
}

export function getStorageInfo() {
  return { localStorage: {}, sessionStorage: {} };
}

export function getFocusInfo() {
  return { activeElement: null };
}

export function getAccessibilityInfo() {
  return {};
}

export function clickElement() {
  return { success: false };
}

export function fillInput() {
  return { success: false };
}

export function scrollTo() {
  return { success: false };
}

export function navigate() {
  return { success: false };
}

export function refresh() {
  return { success: false };
}

export function goBack() {
  return { success: false };
}

export function goForward() {
  return { success: false };
}

export function registerAction() {
  // no-op
}

export function unregisterAction() {
  // no-op
}

export function getActions() {
  return [];
}

export function executeAction() {
  return Promise.resolve({ success: false });
}

// Re-export types (these have no runtime cost)
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
