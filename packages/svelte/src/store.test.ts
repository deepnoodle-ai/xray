import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'
import { getXrayCollector, initXray, trackStore } from './store.js'

describe('xray-svelte', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    // Double check window globals are gone
    delete (window as any).__XRAY_COLLECTOR__
    delete (window as any).__XRAY_READY__
  })

  it('initXray initializes collector and exposes it on window', () => {
    cleanup = initXray()

    expect((window as any).__XRAY_COLLECTOR__).toBeDefined()
    expect((window as any).__XRAY_READY__).toBe(true)
    expect(getXrayCollector()).toBeDefined()
  })

  it('initXray does nothing when enabled is false', () => {
    cleanup = initXray({ enabled: false })

    expect((window as any).__XRAY_COLLECTOR__).toBeUndefined()
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
    expect((window as any).__XRAY_COLLECTOR__).toBeDefined()
    
    cleanup!()
    cleanup = undefined
    
    expect((window as any).__XRAY_COLLECTOR__).toBeNull()
    expect((window as any).__XRAY_READY__).toBe(false)
  })
})
