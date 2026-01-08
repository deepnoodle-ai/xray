import type { XrayCollector, XrayScope } from '@deepnoodle/xray-core'
import {
  createXrayScope,
  getCollector,
  registerAction,
  registerFunction,
  unregisterAction,
  unregisterFunction,
} from '@deepnoodle/xray-core'
import { inject, onUnmounted, type Ref, type WatchSource, watch } from 'vue'

/**
 * Register reactive state with xray for inspection.
 *
 * @param name - Unique identifier for this state (e.g., "UserProfile", "CartState")
 * @param state - A ref, reactive object, or getter function returning the state
 *
 * @example
 * ```vue
 * <script setup>
 * import { ref, reactive } from 'vue';
 * import { useXray } from 'xray/vue';
 *
 * const filter = ref('all');
 * const data = reactive({ items: [], loading: false });
 *
 * // Track a ref
 * useXray('Filter', filter);
 *
 * // Track a reactive object
 * useXray('Data', () => ({ items: data.items.length, loading: data.loading }));
 * </script>
 * ```
 */
export function useXray(
  name: string,
  state: Ref<unknown> | WatchSource<unknown> | (() => unknown),
): void {
  const collector = getCollector()
  if (!collector) return

  // Watch the state and update on changes
  const stopWatch = watch(
    state as WatchSource<unknown>,
    (value) => {
      collector.registerState(name, value)
    },
    { immediate: true, deep: true },
  )

  onUnmounted(() => {
    stopWatch()
    collector.unregisterState(name)
  })
}

/**
 * Register arbitrary custom state with xray.
 * Alias for useXray with semantic clarity for non-component state.
 */
export function useXrayCustom(
  name: string,
  state: Ref<unknown> | WatchSource<unknown> | (() => unknown),
): void {
  useXray(name, state)
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
 * ```vue
 * <script setup>
 * import { useXrayAction } from 'xray/vue';
 *
 * const submitForm = async () => {
 *   await api.submit(formData);
 * };
 *
 * // Register this action so agents can trigger it
 * useXrayAction('submitForm', submitForm, 'Submit the form');
 * </script>
 * ```
 */
export function useXrayAction(
  name: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
  description?: string,
): void {
  registerAction({ name, handler, description })

  onUnmounted(() => {
    unregisterAction(name)
  })
}

/**
 * Inject the xray collector from the Vue plugin.
 * Use this for advanced use cases where you need direct collector access.
 */
export function useXrayCollector(): XrayCollector | null {
  const injected = inject<XrayCollector | null>('xray-collector', null)
  return injected ?? getCollector()
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
 * ```vue
 * <script setup>
 * import { useXrayFunction } from 'xray/vue';
 *
 * const canvasRef = ref<HTMLCanvasElement>();
 *
 * useXrayFunction('captureCanvas', () => {
 *   return canvasRef.value?.toDataURL('image/png');
 * });
 * </script>
 * ```
 */
export function useXrayFunction(
  name: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
  description?: string,
): void {
  registerFunction({ name, handler, description })

  onUnmounted(() => {
    unregisterFunction(name)
  })
}

/**
 * Create a scoped function registry with automatic cleanup.
 * All functions registered through the scope are prefixed with the given prefix.
 *
 * @param prefix - Prefix for all function names (e.g., "canvas.main")
 * @returns Scoped registry with registerFunction and unregisterFunction
 *
 * @example
 * ```vue
 * <script setup>
 * import { useXrayScope } from 'xray/vue';
 *
 * const props = defineProps<{ canvasId: string }>();
 * const canvasRef = ref<HTMLCanvasElement>();
 *
 * const xray = useXrayScope(`canvas.${props.canvasId}`);
 *
 * xray.registerFunction('capture', () => canvasRef.value?.toDataURL());
 * xray.registerFunction('getSize', () => ({
 *   width: canvasRef.value?.width,
 *   height: canvasRef.value?.height
 * }));
 * </script>
 * ```
 */
export function useXrayScope(prefix: string): XrayScope {
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

  onUnmounted(() => {
    for (const name of registeredNames) {
      unregisterFunction(`${prefix}.${name}`)
    }
    registeredNames.clear()
  })

  return scope
}
