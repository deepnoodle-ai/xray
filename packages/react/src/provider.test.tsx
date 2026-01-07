import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { XrayProvider, useXrayCollector } from './provider.js'

describe('XrayProvider', () => {
  afterEach(() => {
    cleanup()
    // Reset window globals
    delete (window as any).__XRAY_COLLECTOR__
    delete (window as any).__XRAY_READY__
  })

  it('initializes collector and exposes it on window', () => {
    render(
      <XrayProvider>
        <div>Test App</div>
      </XrayProvider>
    )

    expect((window as any).__XRAY_COLLECTOR__).toBeDefined()
    expect((window as any).__XRAY_READY__).toBe(true)
  })

  it('provides collector via context', () => {
    let collector: any

    function TestComponent() {
      collector = useXrayCollector()
      return null
    }

    render(
      <XrayProvider>
        <TestComponent />
      </XrayProvider>
    )

    expect(collector).toBeDefined()
    expect(collector.addError).toBeDefined()
    expect(collector).toBe((window as any).__XRAY_COLLECTOR__)
  })

  it('does not initialize when enabled is false', () => {
    render(
      <XrayProvider enabled={false}>
        <div>Test App</div>
      </XrayProvider>
    )

    expect((window as any).__XRAY_COLLECTOR__).toBeUndefined()
  })

  it('cleans up on unmount', () => {
    const { unmount } = render(
      <XrayProvider>
        <div>Test App</div>
      </XrayProvider>
    )

    expect((window as any).__XRAY_COLLECTOR__).toBeDefined()
    
    unmount()
    
    expect((window as any).__XRAY_COLLECTOR__).toBeNull()
    expect((window as any).__XRAY_READY__).toBe(false)
  })
})
