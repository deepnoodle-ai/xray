/**
 * No-op implementations for production builds.
 * Import this instead of xray-svelte in production for zero bundle impact.
 */

// Svelte-specific no-ops
export function initXray() {
  return () => {};
}

export function trackStore<T>(_name: string, _store: unknown): () => void {
  return () => {};
}

export function registerState(_name: string, _value: unknown): void {
  // no-op
}

export function unregisterState(_name: string): void {
  // no-op
}

export function registerXrayAction(
  _name: string,
  _handler: (...args: unknown[]) => unknown,
  _description?: string
): () => void {
  return () => {};
}

export function getXrayCollector() {
  return null;
}

// Re-export core no-ops
export * from "xray-core/noop";
