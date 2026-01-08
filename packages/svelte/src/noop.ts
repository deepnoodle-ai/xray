/**
 * No-op implementations for production builds.
 * Import this instead of xray-svelte in production for zero bundle impact.
 */

import type { XrayCollector } from '@deepnoodle/xray-core'

// Svelte-specific no-ops
export interface XrayOptions {
  enabled?: boolean
  port?: number
  maxConsoleEntries?: number
  maxNetworkEntries?: number
  maxErrors?: number
  captureHeaders?: boolean
  captureBodies?: boolean
  maxBodySize?: number
  redactHeaders?: string[]
  redactBodyFields?: string[]
}

export function initXray(_options?: XrayOptions): () => void {
  return () => {}
}

export function trackStore<_T>(_name: string, _store: unknown): () => void {
  return () => {}
}

export function registerState(_name: string, _value: unknown): void {
  // no-op
}

export function unregisterState(_name: string): void {
  // no-op
}

export function registerXrayAction(
  _name: string,
  _handler: (...args: unknown[]) => unknown | Promise<unknown>,
  _description?: string,
): () => void {
  return () => {}
}

export function getXrayCollector(): XrayCollector | null {
  return null
}

// Re-export core no-ops
export * from '@deepnoodle/xray-core/noop'
