import { beforeEach, describe, expect, it } from 'vitest'
import { createCollector, getCollector, setCollector } from './collector.js'
import type { ConsoleEntry, NetworkRequest } from './types.js'

describe('createCollector', () => {
  it('creates a collector with initial empty state', () => {
    const collector = createCollector()
    const state = collector.getState()

    expect(state.registered).toEqual({})
    expect(state.errors).toEqual([])
    expect(state.warnings).toEqual([])
    expect(state.console).toEqual([])
    expect(state.network).toEqual([])
    expect(state.timestamp).toBeDefined()
  })

  it('respects custom config options', () => {
    const collector = createCollector({ maxErrors: 2 })

    collector.addError({ message: 'error1', timestamp: Date.now() })
    collector.addError({ message: 'error2', timestamp: Date.now() })
    collector.addError({ message: 'error3', timestamp: Date.now() })

    const state = collector.getState()
    expect(state.errors).toHaveLength(2)
    expect(state.errors[0].message).toBe('error2')
    expect(state.errors[1].message).toBe('error3')
  })
})

describe('registerState / unregisterState', () => {
  let collector: ReturnType<typeof createCollector>

  beforeEach(() => {
    collector = createCollector()
  })

  it('registers state with a name', () => {
    collector.registerState('user', { id: 1, name: 'Test' })
    const state = collector.getState()

    expect(state.registered.user).toBeDefined()
    expect(state.registered.user.state).toEqual({ id: 1, name: 'Test' })
    expect(state.registered.user.name).toBe('user')
    expect(state.registered.user.updatedAt).toBeDefined()
  })

  it('updates existing registered state', () => {
    collector.registerState('user', { id: 1 })
    collector.registerState('user', { id: 2 })

    const state = collector.getState()
    expect(state.registered.user.state).toEqual({ id: 2 })
  })

  it('unregisters state', () => {
    collector.registerState('user', { id: 1 })
    collector.unregisterState('user')

    const state = collector.getState()
    expect(state.registered.user).toBeUndefined()
  })
})

describe('addError', () => {
  it('adds errors and trims to max', () => {
    const collector = createCollector({ maxErrors: 3 })

    for (let i = 0; i < 5; i++) {
      collector.addError({ message: `error${i}`, timestamp: Date.now() })
    }

    const state = collector.getState()
    expect(state.errors).toHaveLength(3)
    expect(state.errors[0].message).toBe('error2')
    expect(state.errors[2].message).toBe('error4')
  })
})

describe('addConsole', () => {
  it('adds console entries and trims to max', () => {
    const collector = createCollector({ maxConsoleEntries: 2 })

    for (let i = 0; i < 4; i++) {
      const entry: ConsoleEntry = {
        level: 'log',
        message: `log${i}`,
        timestamp: Date.now(),
      }
      collector.addConsole(entry)
    }

    const state = collector.getState()
    expect(state.console).toHaveLength(2)
    expect(state.console[0].message).toBe('log2')
  })

  it('tracks warnings separately', () => {
    const collector = createCollector()

    collector.addConsole({
      level: 'log',
      message: 'info',
      timestamp: Date.now(),
    })
    collector.addConsole({
      level: 'warn',
      message: 'warning1',
      timestamp: Date.now(),
    })
    collector.addConsole({
      level: 'warn',
      message: 'warning2',
      timestamp: Date.now(),
    })

    const state = collector.getState()
    expect(state.warnings).toHaveLength(2)
    expect(state.warnings).toContain('warning1')
    expect(state.warnings).toContain('warning2')
  })
})

describe('addNetwork / updateNetwork', () => {
  let collector: ReturnType<typeof createCollector>

  beforeEach(() => {
    collector = createCollector()
  })

  it('adds network requests', () => {
    const request: NetworkRequest = {
      id: 'req-1',
      url: 'https://api.example.com/users',
      method: 'GET',
      timestamp: Date.now(),
      status: null,
      duration: null,
    }
    collector.addNetwork(request)

    const state = collector.getState()
    expect(state.network).toHaveLength(1)
    expect(state.network[0].url).toBe('https://api.example.com/users')
  })

  it('updates existing network request', () => {
    const request: NetworkRequest = {
      id: 'req-1',
      url: 'https://api.example.com/users',
      method: 'GET',
      timestamp: Date.now(),
      status: null,
      duration: null,
    }
    collector.addNetwork(request)
    collector.updateNetwork('req-1', { status: 200, duration: 150 })

    const state = collector.getState()
    expect(state.network[0].status).toBe(200)
    expect(state.network[0].duration).toBe(150)
  })

  it('trims to max network entries', () => {
    const collector = createCollector({ maxNetworkEntries: 2 })

    for (let i = 0; i < 4; i++) {
      collector.addNetwork({
        id: `req-${i}`,
        url: `https://api.example.com/${i}`,
        method: 'GET',
        timestamp: Date.now(),
        status: 200,
        duration: 100,
      })
    }

    const state = collector.getState()
    expect(state.network).toHaveLength(2)
    expect(state.network[0].id).toBe('req-2')
  })
})

describe('clear', () => {
  it('clears all collected data', () => {
    const collector = createCollector()

    collector.registerState('user', { id: 1 })
    collector.addError({ message: 'error', timestamp: Date.now() })
    collector.addConsole({
      level: 'warn',
      message: 'warning',
      timestamp: Date.now(),
    })
    collector.addNetwork({
      id: 'req-1',
      url: 'https://api.example.com',
      method: 'GET',
      timestamp: Date.now(),
      status: 200,
      duration: 100,
    })

    collector.clear()
    const state = collector.getState()

    expect(state.registered).toEqual({})
    expect(state.errors).toEqual([])
    expect(state.warnings).toEqual([])
    expect(state.console).toEqual([])
    expect(state.network).toEqual([])
  })
})

describe('getCollector / setCollector', () => {
  beforeEach(() => {
    // Reset global collector before each test
    setCollector(null)
  })

  it('returns null when no collector is set', () => {
    expect(getCollector()).toBeNull()
  })

  it('sets and retrieves the global collector', () => {
    const collector = createCollector()
    setCollector(collector)

    expect(getCollector()).toBe(collector)
  })
})
