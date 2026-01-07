import { createApp } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupXray, xrayVuePlugin } from './plugin.js'

describe('xrayVuePlugin', () => {
  afterEach(() => {
    cleanupXray()
    // Double check window globals are gone
    delete (window as any).__XRAY_COLLECTOR__
    delete (window as any).__XRAY_READY__
  })

  it('installs and exposes collector on window', () => {
    const app = createApp({})
    app.use(xrayVuePlugin)

    expect((window as any).__XRAY_COLLECTOR__).toBeDefined()
    expect((window as any).__XRAY_READY__).toBe(true)
  })

  it('does not install when enabled is false', () => {
    const app = createApp({})
    app.use(xrayVuePlugin, { enabled: false })

    expect((window as any).__XRAY_COLLECTOR__).toBeUndefined()
  })

  it('cleans up correctly', () => {
    const app = createApp({})
    app.use(xrayVuePlugin)

    expect((window as any).__XRAY_COLLECTOR__).toBeDefined()
    
    cleanupXray()
    
    expect((window as any).__XRAY_COLLECTOR__).toBeNull()
    expect((window as any).__XRAY_READY__).toBe(false)
  })
})
