/**
 * Browser-side utilities for DOM queries, screenshots, and diagnostics.
 */

import type {
  DomQueryResult,
  FocusInfo,
  PerformanceMetrics,
  StorageInfo,
  ViewportInfo,
  XrayAction,
} from './types.js'

// Action registry
const actions = new Map<string, XrayAction>()

export function registerAction(action: XrayAction): void {
  actions.set(action.name, action)
}

export function unregisterAction(name: string): void {
  actions.delete(name)
}

export function getActions(): XrayAction[] {
  return Array.from(actions.values())
}

export async function executeAction(
  name: string,
  args: unknown[] = [],
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const action = actions.get(name)
  if (!action) {
    return { success: false, error: `Action "${name}" not found` }
  }

  try {
    const result = await action.handler(...args)
    return { success: true, result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Query the DOM and return structured information about matching elements.
 */
export function queryDom(
  selector: string,
  options: { includeStyles?: boolean; all?: boolean } = {},
): DomQueryResult | DomQueryResult[] {
  if (typeof document === 'undefined') {
    return {
      found: false,
      count: 0,
      html: null,
      text: null,
      attributes: null,
      boundingRect: null,
      visible: false,
    }
  }

  const elements = document.querySelectorAll(selector)

  if (elements.length === 0) {
    return {
      found: false,
      count: 0,
      html: null,
      text: null,
      attributes: null,
      boundingRect: null,
      visible: false,
    }
  }

  const getElementInfo = (el: Element): DomQueryResult => {
    const rect = el.getBoundingClientRect()
    const styles = window.getComputedStyle(el)
    const isVisible =
      styles.display !== 'none' &&
      styles.visibility !== 'hidden' &&
      styles.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0

    const attrs: Record<string, string> = {}
    for (const attr of el.attributes) {
      attrs[attr.name] = attr.value
    }

    const result: DomQueryResult = {
      found: true,
      count: 1,
      html: el.outerHTML.slice(0, 5000), // Limit size
      text: el.textContent?.slice(0, 1000) || null,
      attributes: attrs,
      boundingRect: rect.toJSON() as DOMRect,
      visible: isVisible,
    }

    if (options.includeStyles) {
      result.computedStyles = {
        display: styles.display,
        visibility: styles.visibility,
        opacity: styles.opacity,
        position: styles.position,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
      }
    }

    return result
  }

  if (options.all) {
    return Array.from(elements).map(getElementInfo)
  }

  const result = getElementInfo(elements[0]!)
  result.count = elements.length
  return result
}

/**
 * Capture a screenshot of the current viewport.
 * Returns base64 data URL or null if not supported.
 */
export async function captureScreenshot(): Promise<string | null> {
  if (typeof document === 'undefined') return null

  // Try using html2canvas if available (loaded separately)
  const html2canvas = (window as unknown as Record<string, unknown>)
    .html2canvas as
    | ((el: Element, opts?: unknown) => Promise<HTMLCanvasElement>)
    | undefined

  if (html2canvas) {
    try {
      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        scale: 1,
      })
      return canvas.toDataURL('image/png')
    } catch (err) {
      console.error('[react-xray] Screenshot failed:', err)
      return null
    }
  }

  // Fallback: return instructions for agent
  return null
}

/**
 * Get viewport and scroll information.
 */
export function getViewportInfo(): ViewportInfo {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, scrollX: 0, scrollY: 0, devicePixelRatio: 1 }
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio,
  }
}

/**
 * Get performance metrics.
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  const metrics: PerformanceMetrics = {
    domContentLoaded: null,
    loadComplete: null,
    usedJSHeapSize: null,
    totalJSHeapSize: null,
    renderCount: 0,
  }

  if (typeof performance === 'undefined') return metrics

  // Navigation timing
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined
  if (nav) {
    metrics.domContentLoaded = Math.round(nav.domContentLoadedEventEnd)
    metrics.loadComplete = Math.round(nav.loadEventEnd)
  }

  // Memory (Chrome only)
  const mem = (
    performance as unknown as {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number }
    }
  ).memory
  if (mem) {
    metrics.usedJSHeapSize = mem.usedJSHeapSize
    metrics.totalJSHeapSize = mem.totalJSHeapSize
  }

  // Render count from global (set by provider)
  metrics.renderCount =
    ((window as unknown as Record<string, unknown>)
      .__XRAY_RENDER_COUNT__ as number) || 0

  return metrics
}

/**
 * Get localStorage and sessionStorage contents.
 */
export function getStorageInfo(): StorageInfo {
  const result: StorageInfo = {
    localStorage: {},
    sessionStorage: {},
  }

  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        result.localStorage[key] = localStorage.getItem(key) || ''
      }
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key) {
        result.sessionStorage[key] = sessionStorage.getItem(key) || ''
      }
    }
  }

  return result
}

/**
 * Get focus state information.
 */
export function getFocusInfo(): FocusInfo {
  if (typeof document === 'undefined') {
    return {
      activeElement: null,
      activeElementId: null,
      activeElementClasses: [],
    }
  }

  const el = document.activeElement
  if (!el || el === document.body) {
    return {
      activeElement: null,
      activeElementId: null,
      activeElementClasses: [],
    }
  }

  return {
    activeElement: el.tagName.toLowerCase(),
    activeElementId: el.id || null,
    activeElementClasses: Array.from(el.classList),
  }
}

/**
 * Get accessibility information for an element.
 */
export function getAccessibilityInfo(
  selector?: string,
): Record<string, unknown> {
  if (typeof document === 'undefined') return {}

  const el = selector ? document.querySelector(selector) : document.body
  if (!el) return { error: 'Element not found' }

  // Get all interactive elements
  const interactiveElements = el.querySelectorAll(
    'a, button, input, select, textarea, [tabindex], [role="button"], [role="link"]',
  )

  const items = Array.from(interactiveElements)
    .slice(0, 50)
    .map((item) => {
      const role = item.getAttribute('role') || item.tagName.toLowerCase()
      const label =
        item.getAttribute('aria-label') ||
        item.getAttribute('title') ||
        (item as HTMLElement).innerText?.slice(0, 50) ||
        null

      return {
        tag: item.tagName.toLowerCase(),
        role,
        label,
        id: item.id || null,
        disabled:
          (item as HTMLButtonElement).disabled ||
          item.getAttribute('aria-disabled') === 'true',
        tabIndex: (item as HTMLElement).tabIndex,
      }
    })

  return {
    interactiveElementCount: interactiveElements.length,
    items,
    documentTitle: document.title,
    lang: document.documentElement.lang || null,
  }
}

/**
 * Click an element by selector.
 */
export function clickElement(selector: string): {
  success: boolean
  error?: string
} {
  if (typeof document === 'undefined') {
    return { success: false, error: 'No document' }
  }

  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) {
    return { success: false, error: `Element not found: ${selector}` }
  }

  el.click()
  return { success: true }
}

/**
 * Fill an input element.
 */
export function fillInput(
  selector: string,
  value: string,
): { success: boolean; error?: string } {
  if (typeof document === 'undefined') {
    return { success: false, error: 'No document' }
  }

  const el = document.querySelector(selector) as HTMLInputElement | null
  if (!el) {
    return { success: false, error: `Element not found: ${selector}` }
  }

  // Trigger events like a real user
  el.focus()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))

  return { success: true }
}

/**
 * Scroll to an element or position.
 */
export function scrollTo(target: string | { x: number; y: number }): {
  success: boolean
  error?: string
} {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No window' }
  }

  if (typeof target === 'string') {
    const el = document.querySelector(target)
    if (!el) {
      return { success: false, error: `Element not found: ${target}` }
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } else {
    window.scrollTo({ left: target.x, top: target.y, behavior: 'smooth' })
  }

  return { success: true }
}

/**
 * Navigate to a URL.
 */
export function navigate(
  url: string,
  options: { replace?: boolean } = {},
): { success: boolean; error?: string } {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No window' }
  }

  try {
    if (options.replace) {
      window.location.replace(url)
    } else {
      window.location.href = url
    }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Refresh the page.
 */
export function refresh(_options: { hard?: boolean } = {}): {
  success: boolean
  error?: string
} {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No window' }
  }

  try {
    window.location.reload()
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Go back in history.
 */
export function goBack(): { success: boolean; error?: string } {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No window' }
  }

  try {
    window.history.back()
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Go forward in history.
 */
export function goForward(): { success: boolean; error?: string } {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No window' }
  }

  try {
    window.history.forward()
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// Expose utilities to window for Vite plugin
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__XRAY_BROWSER__ = {
    queryDom,
    captureScreenshot,
    getViewportInfo,
    getPerformanceMetrics,
    getStorageInfo,
    getFocusInfo,
    getAccessibilityInfo,
    clickElement,
    fillInput,
    scrollTo,
    navigate,
    refresh,
    goBack,
    goForward,
    executeAction,
    getActions,
  }
}
