/**
 * No-op implementations for production builds.
 * Import this instead of xray-react in production for zero bundle impact.
 */

import type { XrayCollector, XrayConfig } from '@deepnoodle/xray-core'
import type { ReactElement, ReactNode } from 'react'

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

// React-specific no-ops
export function XrayProvider({
  children,
  enabled: _enabled,
  config: _config,
}: {
  children: ReactNode
  enabled?: boolean
  config?: XrayConfig
}): ReactElement {
  return children as ReactElement
}

export function useXrayCollector(): XrayCollector {
  return noopCollector
}

export function useXray(_name: string, _state: unknown): void {
  // no-op
}

export function useXrayCustom(_name: string, _state: unknown): void {
  // no-op
}

export function useXrayLazy(
  _name: string,
  _getValue: () => unknown,
  _deps: unknown[],
): void {
  // no-op
}

export function useXrayAction(
  _name: string,
  _handler: (...args: unknown[]) => unknown,
  _description?: string,
): void {
  // no-op
}

// Re-export core no-ops
export * from '@deepnoodle/xray-core/noop'
