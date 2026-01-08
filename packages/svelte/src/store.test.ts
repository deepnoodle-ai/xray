import type { XrayCollector } from '@deepnoodle/xray-core'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'
import { getXrayCollector, initXray, trackStore } from './store.js'

interface XrayWindow {
  __XRAY_COLLECTOR__?: XrayCollector | null
  __XRAY_READY__?: boolean
}

const xrayWindow = window as unknown as XrayWindow

describe('xray-svelte', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    // Double check window globals are gone
    delete xrayWindow.__XRAY_COLLECTOR__
    delete xrayWindow.__XRAY_READY__
  })

  it('initXray initializes collector and exposes it on window', () => {
    cleanup = initXray()

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeDefined()
    expect(xrayWindow.__XRAY_READY__).toBe(true)
    expect(getXrayCollector()).toBeDefined()
  })

  it('initXray does nothing when enabled is false', () => {
    cleanup = initXray({ enabled: false })

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeUndefined()
    expect(getXrayCollector()).toBeNull()
  })

  it('trackStore updates collector state', () => {
    cleanup = initXray()
    const count = writable(0)
    const untrack = trackStore('counter', count)

    const collector = getXrayCollector()
    let state = collector!.getState()
    expect(state.registered.counter.state).toBe(0)

    count.set(1)
    state = collector!.getState()
    expect(state.registered.counter.state).toBe(1)

    untrack()
    state = collector!.getState()
    expect(state.registered.counter).toBeUndefined()
  })

  it('cleans up correctly', () => {
    cleanup = initXray()
    expect(xrayWindow.__XRAY_COLLECTOR__).toBeDefined()

    cleanup!()
    cleanup = undefined

    expect(xrayWindow.__XRAY_COLLECTOR__).toBeNull()
    expect(xrayWindow.__XRAY_READY__).toBe(false)
  })
})
