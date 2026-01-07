import type { App, Plugin } from "vue";
import type { XrayConfig, XrayCollector } from "xray-core";
import { createCollector, setCollector, setupInterceptors } from "xray-core";

// Import to ensure browser utilities are loaded and attached to window
import "xray-core";

export interface XrayPluginOptions extends XrayConfig {
  /** Enable the inspector (default: true) */
  enabled?: boolean;
}

let cleanup: (() => void) | null = null;
let collector: XrayCollector | null = null;

export const xrayVuePlugin: Plugin = {
  install(app: App, options: XrayPluginOptions = {}) {
    const { enabled = true, ...config } = options;

    if (!enabled) return;

    // Create collector
    collector = createCollector(config);
    setCollector(collector);

    // Set up interceptors (pass config for headers/body capture settings)
    cleanup = setupInterceptors(collector, config);

    // Expose collector to window for Vite plugin communication
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__XRAY_COLLECTOR__ = collector;
      (window as unknown as Record<string, unknown>).__XRAY_READY__ = true;
      window.dispatchEvent(new CustomEvent("xray:ready"));
    }

    // Provide collector to components
    app.provide("xray-collector", collector);

    // Clean up on app unmount
    app.config.globalProperties.$xray = collector;
  },
};

/**
 * Get the xray collector instance.
 * Must be called after the plugin is installed.
 */
export function getXrayCollector(): XrayCollector | null {
  return collector;
}

/**
 * Clean up xray interceptors.
 * Call this when your app unmounts if needed.
 */
export function cleanupXray(): void {
  cleanup?.();
  cleanup = null;
  collector = null;
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__XRAY_COLLECTOR__ = null;
    (window as unknown as Record<string, unknown>).__XRAY_READY__ = false;
  }
}

export default xrayVuePlugin;
