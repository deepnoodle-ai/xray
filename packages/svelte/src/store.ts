import type { Readable, Writable } from 'svelte/store'
import type { XrayCollector, XrayConfig } from 'xray-core'
import {
  createCollector,
  getCollector,
  registerAction,
  setCollector,
  setupInterceptors,
  unregisterAction,
} from 'xray-core'

// Import to ensure browser utilities are loaded and attached to window
import 'xray-core'

let cleanup: (() => void) | null = null
let collector: XrayCollector | null = null

export interface XrayOptions extends XrayConfig {
  /** Enable the inspector (default: true) */
  enabled?: boolean
}

/**
 * Initialize xray for your Svelte app.
 * Call this once at app startup (e.g., in +layout.svelte or main.ts).
 *
 * @example
 * ```svelte
 * <!-- +layout.svelte -->
 * <script>
 *   import { initXray } from 'xray-svelte';
 *   import { onDestroy } from 'svelte';
 *
 *   const cleanup = initXray();
 *   onDestroy(cleanup);
 * </script>
 * ```
 */
export function initXray(options: XrayOptions = {}): () => void {
  const { enabled = true, ...config } = options

  if (!enabled) return () => {}

  // Create collector
  collector = createCollector(config)
  setCollector(collector)

  // Set up interceptors (pass config for headers/body capture settings)
  cleanup = setupInterceptors(collector, config)

  // Expose collector to window for Vite plugin communication
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__XRAY_COLLECTOR__ =
      collector
    ;(window as unknown as Record<string, unknown>).__XRAY_READY__ = true
    window.dispatchEvent(new CustomEvent('xray:ready'))
  }

  // Return cleanup function
  return () => {
    cleanup?.()
    cleanup = null
    collector = null
    if (typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__XRAY_COLLECTOR__ = null
      ;(window as unknown as Record<string, unknown>).__XRAY_READY__ = false
    }
  }
}

/**
 * Register a Svelte store with xray for inspection.
 * The store's value will be tracked and exposed via /xray/state.
 *
 * @param name - Unique identifier for this state
 * @param store - A Svelte readable or writable store
 * @returns Unsubscribe function
 *
 * @example
 * ```svelte
 * <script>
 *   import { writable } from 'svelte/store';
 *   import { trackStore } from 'xray-svelte';
 *   import { onDestroy } from 'svelte';
 *
 *   const count = writable(0);
 *   const untrack = trackStore('Counter', count);
 *   onDestroy(untrack);
 * </script>
 * ```
 */
export function trackStore<T>(
  name: string,
  store: Readable<T> | Writable<T>,
): () => void {
  const collector = getCollector()
  if (!collector) return () => {}

  const unsubscribe = store.subscribe((value) => {
    collector.registerState(name, value)
  })

  return () => {
    unsubscribe()
    collector.unregisterState(name)
  }
}

/**
 * Register a value with xray for inspection.
 * For reactive updates, use trackStore instead.
 *
 * @param name - Unique identifier for this state
 * @param value - The value to register
 *
 * @example
 * ```svelte
 * <script>
 *   import { registerState, unregisterState } from 'xray-svelte';
 *   import { onDestroy } from 'svelte';
 *
 *   registerState('Config', { theme: 'dark', locale: 'en' });
 *   onDestroy(() => unregisterState('Config'));
 * </script>
 * ```
 */
export function registerState(name: string, value: unknown): void {
  const collector = getCollector()
  collector?.registerState(name, value)
}

/**
 * Unregister a previously registered state.
 */
export function unregisterState(name: string): void {
  const collector = getCollector()
  collector?.unregisterState(name)
}

/**
 * Register an action that agents can trigger remotely.
 * Actions are functions that can be called via the /xray/action endpoint.
 *
 * @param name - Unique identifier for this action
 * @param handler - Function to execute when action is triggered
 * @param description - Optional description shown to agents
 * @returns Unregister function
 *
 * @example
 * ```svelte
 * <script>
 *   import { registerXrayAction } from 'xray-svelte';
 *   import { onDestroy } from 'svelte';
 *
 *   const submitForm = async () => {
 *     await api.submit(formData);
 *   };
 *
 *   const unregister = registerXrayAction('submitForm', submitForm, 'Submit the form');
 *   onDestroy(unregister);
 * </script>
 * ```
 */
export function registerXrayAction(
  name: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
  description?: string,
): () => void {
  registerAction({ name, handler, description })
  return () => unregisterAction(name)
}

/**
 * Get the xray collector instance.
 */
export function getXrayCollector(): XrayCollector | null {
  return getCollector()
}
