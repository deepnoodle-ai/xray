/**
 * No-op implementations for production builds.
 * Import this instead of xray-vue in production for zero bundle impact.
 */

import type { App, Plugin } from "vue";

// Vue-specific no-ops
export const xrayVuePlugin: Plugin = {
  install(_app: App) {
    // no-op
  },
};

export function getXrayCollector() {
  return null;
}

export function cleanupXray() {
  // no-op
}

export function useXray(_name: string, _state: unknown): void {
  // no-op
}

export function useXrayCustom(_name: string, _state: unknown): void {
  // no-op
}

export function useXrayAction(
  _name: string,
  _handler: (...args: unknown[]) => unknown,
  _description?: string
): void {
  // no-op
}

export function useXrayCollector() {
  return null;
}

// Re-export core no-ops
export * from "xray-core/noop";

export default xrayVuePlugin;
