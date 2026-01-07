import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { XrayScope } from 'xray-core'
import {
  createXrayScope,
  getCollector,
  registerAction,
  registerFunction,
  safeSerialize,
  unregisterAction,
  unregisterFunction,
} from 'xray-core'

/**
 * Register state with react-xray for inspection.
 *
 * @param name - Unique identifier for this state (e.g., "UserProfile", "CartState")
 * @param state - The state value to expose (will be serialized to JSON)
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const [filter, setFilter] = useState('all');
 *   const [data, setData] = useState([]);
 *
 *   useXray('Dashboard', { filter, dataCount: data.length });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useXray(name: string, state: unknown): void {
  const collector = getCollector()
  const prevStateRef = useRef<string>()

  useEffect(() => {
    if (!collector) return

    // Only update if state actually changed (shallow comparison via safe serialization)
    const serialized = safeSerialize(state)
    if (serialized !== prevStateRef.current) {
      prevStateRef.current = serialized
      collector.registerState(name, state)
    }

    return () => {
      collector.unregisterState(name)
    }
  }, [name, state, collector])
}

/**
 * Register arbitrary custom state with react-xray.
 * Use this for non-component state like global stores, context values, etc.
 *
 * @param name - Unique identifier for this state
 * @param state - The state value to expose
 *
 * @example
 * ```tsx
 * // In a Zustand store or similar
 * function StoreProvider({ children }) {
 *   const store = useStore();
 *   useXrayCustom('GlobalStore', {
 *     user: store.user,
 *     cart: store.cart,
 *   });
 *   return children;
 * }
 * ```
 */
export function useXrayCustom(name: string, state: unknown): void {
  // Same implementation, different name for semantic clarity
  useXray(name, state)
}

/**
 * Register a value that updates frequently without causing re-registrations.
 * Uses a ref internally to avoid unnecessary updates.
 *
 * @param name - Unique identifier
 * @param getValue - Function that returns the current state
 * @param deps - Dependencies that trigger re-evaluation
 */
export function useXrayLazy(
  name: string,
  getValue: () => unknown,
  deps: unknown[],
): void {
  const collector = getCollector()

  useEffect(() => {
    if (!collector) return

    const state = getValue()
    collector.registerState(name, state)

    return () => {
      collector.unregisterState(name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, collector, ...deps, getValue])
}

/**
 * Register an action that agents can trigger remotely.
 * Actions are functions that can be called via the /xray/action endpoint.
 *
 * @param name - Unique identifier for this action
 * @param handler - Function to execute when action is triggered
 * @param description - Optional description shown to agents
 *
 * @example
 * ```tsx
 * function LoginForm() {
 *   const [email, setEmail] = useState('');
 *   const [password, setPassword] = useState('');
 *
 *   const handleSubmit = useCallback(async () => {
 *     await login(email, password);
 *   }, [email, password]);
 *
 *   // Register this action so agents can trigger it
 *   useXrayAction('submitLogin', handleSubmit, 'Submit the login form');
 *
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 * ```
 *
 * Agent can then call:
 * ```bash
 * curl -X POST localhost:5173/xray/action -d '{"name":"submitLogin"}'
 * ```
 */
export function useXrayAction(
  name: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
  description?: string,
): void {
  // Memoize handler to avoid re-registering on every render
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const stableHandler = useCallback((...args: unknown[]) => {
    return handlerRef.current(...args)
  }, [])

  useEffect(() => {
    registerAction({ name, handler: stableHandler, description })

    return () => {
      unregisterAction(name)
    }
  }, [name, stableHandler, description])
}

/**
 * Register a function that can be called remotely via HTTP.
 * Functions are for data retrieval (screenshots, state dumps, etc.).
 *
 * @param name - Unique identifier for this function (can use dot notation for namespacing)
 * @param handler - Function that returns data when called
 * @param description - Optional description shown when listing functions
 *
 * @example
 * ```tsx
 * function GameCanvas({ renderer }) {
 *   useXrayFunction('captureCanvas', () => {
 *     return renderer.domElement.toDataURL('image/png');
 *   });
 *
 *   return <canvas ref={canvasRef} />;
 * }
 * ```
 *
 * Agent can then call:
 * ```bash
 * curl localhost:5173/xray/call/captureCanvas
 * # { "success": true, "result": "data:image/png;base64,..." }
 * ```
 */
export function useXrayFunction(
  name: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
  description?: string,
): void {
  // Memoize handler to avoid re-registering on every render
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const stableHandler = useCallback((...args: unknown[]) => {
    return handlerRef.current(...args)
  }, [])

  useEffect(() => {
    registerFunction({ name, handler: stableHandler, description })

    return () => {
      unregisterFunction(name)
    }
  }, [name, stableHandler, description])
}

/**
 * Create a scoped function registry with automatic cleanup.
 * All functions registered through the scope are prefixed with the given prefix.
 *
 * @param prefix - Prefix for all function names (e.g., "canvas.main")
 * @returns Scoped registry with registerFunction and unregisterFunction
 *
 * @example
 * ```tsx
 * function GameCanvas({ canvasId }) {
 *   const xray = useXrayScope(`canvas.${canvasId}`);
 *
 *   useEffect(() => {
 *     xray.registerFunction('capture', () => canvasRef.current.toDataURL());
 *     xray.registerFunction('getSize', () => ({
 *       width: canvasRef.current.width,
 *       height: canvasRef.current.height
 *     }));
 *   }, [xray]);
 *
 *   return <canvas ref={canvasRef} />;
 * }
 * ```
 *
 * Agent can then call:
 * ```bash
 * curl localhost:5173/xray/call/canvas.main.capture
 * curl localhost:5173/xray/call/canvas.minimap.getSize
 * ```
 */
export function useXrayScope(prefix: string): XrayScope {
  // Track registered function names for cleanup
  const registeredNames = useRef<Set<string>>(new Set())

  // Create a stable scope object
  const scope = useMemo(() => {
    const baseScope = createXrayScope(prefix)

    return {
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
        registeredNames.current.add(name)
        baseScope.registerFunction(nameOrFn, handler)
      },
      unregisterFunction: (name: string) => {
        registeredNames.current.delete(name)
        baseScope.unregisterFunction(name)
      },
    }
  }, [prefix])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const name of registeredNames.current) {
        unregisterFunction(`${prefix}.${name}`)
      }
      registeredNames.current.clear()
    }
  }, [prefix])

  return scope
}
