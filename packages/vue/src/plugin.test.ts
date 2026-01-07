import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import type { XrayCollector } from 'xray-core'
import { cleanupXray, xrayVuePlugin } from './plugin.js'

interface XrayWindow {
  __XRAY_COLLECTOR__?: XrayCollector | null
  __XRAY_READY__?: boolean
}

const xrayWindow = window as unknown as XrayWindow

describe('xrayVuePlugin', () => {
  afterEach(() => {
    cleanupXray()
    // Double check window globals are gone
    delete xrayWindow.__XRAY_COLLECTOR__
    delete xrayWindow.__XRAY_READY__
  })

  it('installs and exposes collector on window', () => {
    const app = createApp({})
    app.use(xrayVuePlugin)

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeDefined()
    expect(xrayWindow.__XRAY_READY__).toBe(true)
  })

  it('does not install when enabled is false', () => {
    const app = createApp({})
    app.use(xrayVuePlugin, { enabled: false })

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeUndefined()
  })

  it('cleans up correctly', () => {
    const app = createApp({})
    app.use(xrayVuePlugin)

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeDefined()

    cleanupXray()

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeNull()
    expect(xrayWindow.__XRAY_READY__).toBe(false)
  })
})
