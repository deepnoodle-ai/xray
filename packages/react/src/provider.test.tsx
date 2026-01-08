import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { XrayCollector } from '@deepnoodle/xray-core'
import { useXrayCollector, XrayProvider } from './provider.js'

interface XrayWindow {
  __XRAY_COLLECTOR__?: XrayCollector | null
  __XRAY_READY__?: boolean
}

const xrayWindow = window as unknown as XrayWindow

describe('XrayProvider', () => {
  afterEach(() => {
    cleanup()
    // Reset window globals
    delete xrayWindow.__XRAY_COLLECTOR__
    delete xrayWindow.__XRAY_READY__
  })

  it('initializes collector and exposes it on window', () => {
    render(
      <XrayProvider>
        <div>Test App</div>
      </XrayProvider>,
    )

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeDefined()
    expect(xrayWindow.__XRAY_READY__).toBe(true)
  })

  it('provides collector via context', () => {
    let collector: XrayCollector | null = null

    function TestComponent() {
      collector = useXrayCollector()
      return null
    }

    render(
      <XrayProvider>
        <TestComponent />
      </XrayProvider>,
    )

    expect(collector).toBeDefined()
    expect(collector!.addError).toBeDefined()
    expect(collector).toBe(xrayWindow.__XRAY_COLLECTOR__)
  })

  it('does not initialize when enabled is false', () => {
    render(
      <XrayProvider enabled={false}>
        <div>Test App</div>
      </XrayProvider>,
    )

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeUndefined()
  })

  it('cleans up on unmount', () => {
    const { unmount } = render(
      <XrayProvider>
        <div>Test App</div>
      </XrayProvider>,
    )

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeDefined()

    unmount()

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeNull()
    expect(xrayWindow.__XRAY_READY__).toBe(false)
  })
})
