import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from 'react'
import type { XrayCollector, XrayConfig } from 'xray-core'
import { createCollector, setCollector, setupInterceptors } from 'xray-core'

// Import to ensure browser utilities are loaded and attached to window
import 'xray-core'

interface XrayContextValue {
  collector: XrayCollector
}

const XrayContext = createContext<XrayContextValue | null>(null)

interface XrayProviderProps {
  children: ReactNode
  /** Enable the inspector (default: true in development) */
  enabled?: boolean
  /** Configuration options */
  config?: XrayConfig
}

export function XrayProvider({
  children,
  enabled = true,
  config = {},
}: XrayProviderProps) {
  const collectorRef = useRef<XrayCollector | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Initialize collector once
  if (!collectorRef.current && enabled) {
    collectorRef.current = createCollector(config)
    setCollector(collectorRef.current)
  }

  useEffect(() => {
    if (!enabled || !collectorRef.current) return

    // Set up interceptors (pass config for headers/body capture settings)
    cleanupRef.current = setupInterceptors(collectorRef.current, config)

    // Expose collector to window for Vite plugin communication
    if (typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__XRAY_COLLECTOR__ =
        collectorRef.current
      ;(window as unknown as Record<string, unknown>).__XRAY_READY__ = true
      window.dispatchEvent(new CustomEvent('xray:ready'))
    }

    return () => {
      cleanupRef.current?.()
      setCollector(null)
      if (typeof window !== 'undefined') {
        ;(window as unknown as Record<string, unknown>).__XRAY_COLLECTOR__ =
          null
        ;(window as unknown as Record<string, unknown>).__XRAY_READY__ = false
      }
    }
  }, [enabled, config])

  if (!enabled) {
    return <>{children}</>
  }

  return (
    <XrayContext.Provider value={{ collector: collectorRef.current! }}>
      <XrayErrorBoundary collector={collectorRef.current!}>
        {children}
      </XrayErrorBoundary>
    </XrayContext.Provider>
  )
}

// Error boundary to catch React errors
interface ErrorBoundaryProps {
  children: ReactNode
  collector: XrayCollector
  /** Optional fallback UI to render when an error occurs */
  fallback?: ReactNode
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class XrayErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to the collector
    this.props.collector.addError({
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      timestamp: Date.now(),
    })

    // Call optional error callback
    this.props.onError?.(error, errorInfo)
  }

  /**
   * Reset the error boundary state to allow re-rendering children.
   * Can be called externally via ref if needed.
   */
  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Render fallback UI if provided, otherwise render nothing
      // Do NOT auto-reset - this would cause infinite loops with persistent errors
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}

// Hook to access the collector
export function useXrayCollector(): XrayCollector {
  const context = useContext(XrayContext)
  if (!context) {
    throw new Error('useXrayCollector must be used within XrayProvider')
  }
  return context.collector
}
