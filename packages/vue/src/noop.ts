/**
 * No-op implementations for production builds.
 * Import this instead of xray-vue in production for zero bundle impact.
 */

import type { App, Plugin } from 'vue'
import type { XrayCollector } from 'xray-core'

// Create a no-op collector that satisfies the interface
const noopCollector: XrayCollector = {
  getState: () => ({
    timestamp: '',
    url: '',
    route: '',
    title: '',
    registered: {},
    errors: [],
    warnings: [],
    console: [],
    network: [],
  }),
  registerState: () => {},
  unregisterState: () => {},
  addError: () => {},
  addConsole: () => {},
  addNetwork: () => {},
  updateNetwork: () => {},
  clear: () => {},
}

// Vue-specific no-ops
export const xrayVuePlugin: Plugin = {
  install(_app: App) {
    // no-op
  },
}

export function getXrayCollector(): XrayCollector | null {
  return null
}

export function cleanupXray(): void {
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
  _description?: string,
): void {
  // no-op
}

export function useXrayCollector(): XrayCollector {
  return noopCollector
}

// Re-export core no-ops
export * from 'xray-core/noop'

export default xrayVuePlugin
