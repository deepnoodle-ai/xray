import type {
  XrayCollector,
  XrayConfig,
  XrayScope,
} from '@deepnoodle/xray-core'
import {
  createCollector,
  createXrayScope,
  getCollector,
  registerAction,
  registerFunction,
  setCollector,
  setupInterceptors,
  unregisterAction,
  unregisterFunction,
} from '@deepnoodle/xray-core'
import type { Readable, Writable } from 'svelte/store'

// Import to ensure browser utilities are loaded and attached to window
import '@deepnoodle/xray-core'

let cleanup: (() => void) | null = null
let collector: XrayCollector | null = null
let pushInterval: ReturnType<typeof setInterval> | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null

export interface XrayOptions extends XrayConfig {
  /** Enable the inspector (default: true) */
  enabled?: boolean
  /** Polling interval for state push in ms (default: 500) */
  pushIntervalMs?: number
  /** Polling interval for command polling in ms (default: 100) */
  pollIntervalMs?: number
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
  const {
    enabled = true,
    pushIntervalMs = 500,
    pollIntervalMs = 100,
    ...config
  } = options

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

    // Start polling - SvelteKit and other SSR frameworks don't use transformIndexHtml,
    // so we handle state pushing and command polling here directly
    startPolling(pushIntervalMs, pollIntervalMs)
  }

  // Return cleanup function
  return () => {
    stopPolling()
    cleanup?.()
    cleanup = null
    collector = null
    setCollector(null)
    if (typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__XRAY_COLLECTOR__ = null
      ;(window as unknown as Record<string, unknown>).__XRAY_READY__ = false
    }
  }
}

/**
 * Safe serializer that handles BigInt, circular refs, etc.
 */
function safeSerialize(
  value: unknown,
  seen = new WeakSet(),
  depth = 0,
): unknown {
  if (depth > 10) return '[Max Depth]'
  if (value === null) return null
  if (value === undefined) return null
  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  )
    return value
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (typeof value === 'function') return '[Function]'
  if (typeof value === 'symbol') return '[Symbol]'
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    if (Array.isArray(value))
      return value.map((v) => safeSerialize(v, seen, depth + 1))
    if (value instanceof Date) return value.toISOString()
    if (value instanceof Error)
      return { name: value.name, message: value.message, stack: value.stack }
    if (value instanceof Map) {
      const obj: Record<string, unknown> = {}
      value.forEach((v, k) => {
        obj[String(k)] = safeSerialize(v, seen, depth + 1)
      })
      return obj
    }
    if (value instanceof Set)
      return Array.from(value).map((v) => safeSerialize(v, seen, depth + 1))
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      try {
        result[key] = safeSerialize(
          (value as Record<string, unknown>)[key],
          seen,
          depth + 1,
        )
      } catch {
        result[key] = '[Unserializable]'
      }
    }
    return result
  }
  return '[Unknown]'
}

/**
 * Start polling for state push and command execution.
 * This is necessary for SSR frameworks (SvelteKit, etc.) that don't use transformIndexHtml.
 */
function startPolling(pushIntervalMs: number, pollIntervalMs: number): void {
  let pushing = false
  let polling = false

  const pushState = async () => {
    if (pushing) return
    const xrayCollector = (
      window as unknown as Record<string, XrayCollector | undefined>
    ).__XRAY_COLLECTOR__
    if (!xrayCollector) return

    pushing = true
    try {
      const state = xrayCollector.getState()
      const serialized = safeSerialize(state)
      await fetch('/xray/__push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serialized),
      })
    } catch {
      // Ignore push errors
    } finally {
      pushing = false
    }
  }

  const pollCommands = async () => {
    if (polling) return
    const browserApi = (
      window as unknown as Record<
        string,
        Record<string, (...args: unknown[]) => unknown> | undefined
      >
    ).__XRAY_BROWSER__
    if (!browserApi) return

    polling = true
    try {
      const res = await fetch('/xray/__commands')
      const commands = (await res.json()) as Array<{
        id: string
        command: string
        args: unknown[]
      }>

      for (const cmd of commands) {
        const { id, command, args } = cmd
        let result: unknown
        let error: string | undefined

        try {
          const fn = browserApi[command]
          if (typeof fn === 'function') {
            result = await fn(...args)
          } else {
            error = `Command not found: ${command}`
          }
        } catch (e) {
          error = e instanceof Error ? e.message : String(e)
        }

        // Send result back to server
        await fetch('/xray/__result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, result, error }),
        })
      }
    } catch {
      // Ignore poll errors
    } finally {
      polling = false
    }
  }

  // Push state periodically and on errors
  pushInterval = setInterval(pushState, pushIntervalMs)
  window.addEventListener('error', () => setTimeout(pushState, 10))

  // Poll for commands frequently
  pollInterval = setInterval(pollCommands, pollIntervalMs)

  // Initial push
  pushState()
}

/**
 * Stop polling for state push and command execution.
 */
function stopPolling(): void {
  if (pushInterval) {
    clearInterval(pushInterval)
    pushInterval = null
  }
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
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

/**
 * Register a function that can be called remotely via HTTP.
 * Functions are for data retrieval (screenshots, state dumps, etc.).
 *
 * @param name - Unique identifier for this function (can use dot notation for namespacing)
 * @param handler - Function that returns data when called
 * @param description - Optional description shown when listing functions
 * @returns Unregister function
 *
 * @example
 * ```svelte
 * <script>
 *   import { registerXrayFunction } from 'xray-svelte';
 *   import { onDestroy } from 'svelte';
 *
 *   let canvas: HTMLCanvasElement;
 *
 *   const unregister = registerXrayFunction('captureCanvas', () => {
 *     return canvas?.toDataURL('image/png');
 *   });
 *   onDestroy(unregister);
 * </script>
 * ```
 */
export function registerXrayFunction(
  name: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
  description?: string,
): () => void {
  registerFunction({ name, handler, description })
  return () => unregisterFunction(name)
}

/**
 * Create a scoped function registry.
 * All functions registered through the scope are prefixed with the given prefix.
 *
 * @param prefix - Prefix for all function names (e.g., "canvas.main")
 * @returns Object with registerFunction and unregisterFunction that auto-prefix names
 *
 * @example
 * ```svelte
 * <script>
 *   import { createXrayScopeWithCleanup } from 'xray-svelte';
 *   import { onDestroy } from 'svelte';
 *
 *   export let canvasId: string;
 *   let canvas: HTMLCanvasElement;
 *
 *   const { scope, cleanup } = createXrayScopeWithCleanup(`canvas.${canvasId}`);
 *
 *   scope.registerFunction('capture', () => canvas?.toDataURL());
 *   scope.registerFunction('getSize', () => ({
 *     width: canvas?.width,
 *     height: canvas?.height
 *   }));
 *
 *   onDestroy(cleanup);
 * </script>
 * ```
 */
export function createXrayScopeWithCleanup(prefix: string): {
  scope: XrayScope
  cleanup: () => void
} {
  const registeredNames = new Set<string>()
  const baseScope = createXrayScope(prefix)

  const scope: XrayScope = {
    registerFunction: (
      nameOrFn:
        | string
        | {
            name: string
            description?: string
            handler: (...args: unknown[]) => unknown | Promise<unknown>
          },
      handler?: (...args: unknown[]) => unknown | Promise<unknown>,
    ) => {
      const name = typeof nameOrFn === 'string' ? nameOrFn : nameOrFn.name
      registeredNames.add(name)
      baseScope.registerFunction(nameOrFn, handler)
    },
    unregisterFunction: (name: string) => {
      registeredNames.delete(name)
      baseScope.unregisterFunction(name)
    },
  }

  const cleanup = () => {
    for (const name of registeredNames) {
      unregisterFunction(`${prefix}.${name}`)
    }
    registeredNames.clear()
  }

  return { scope, cleanup }
}
