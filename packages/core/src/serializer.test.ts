import { describe, expect, it } from 'vitest'
import { safeSerialize, safeStringify } from './serializer.js'

describe('safeSerialize', () => {
  describe('primitive values', () => {
    it('serializes null', () => {
      expect(safeSerialize(null)).toBe('null')
    })

    it('serializes undefined as null', () => {
      expect(safeSerialize(undefined)).toBe('null')
    })

    it('serializes booleans', () => {
      expect(safeSerialize(true)).toBe('true')
      expect(safeSerialize(false)).toBe('false')
    })

    it('serializes numbers', () => {
      expect(safeSerialize(42)).toBe('42')
      expect(safeSerialize(3.14)).toBe('3.14')
      expect(safeSerialize(-0)).toBe('0')
    })

    it('serializes strings', () => {
      expect(safeSerialize('hello')).toBe('"hello"')
      expect(safeSerialize('')).toBe('""')
    })
  })

  describe('BigInt handling', () => {
    it('serializes BigInt with "n" suffix', () => {
      expect(safeSerialize(BigInt(123))).toBe('"123n"')
      expect(safeSerialize(BigInt(-456))).toBe('"-456n"')
      expect(safeSerialize(BigInt('9007199254740993'))).toBe(
        '"9007199254740993n"',
      )
    })

    it('serializes objects containing BigInt', () => {
      const obj = { count: BigInt(42), name: 'test' }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.count).toBe('42n')
      expect(result.name).toBe('test')
    })
  })

  describe('circular reference handling', () => {
    it('handles self-referential objects', () => {
      const obj: Record<string, unknown> = { name: 'test' }
      obj.self = obj
      const result = JSON.parse(safeSerialize(obj))
      expect(result.name).toBe('test')
      expect(result.self).toBe('[Circular]')
    })

    it('handles circular references in arrays', () => {
      const arr: unknown[] = [1, 2]
      arr.push(arr)
      const result = JSON.parse(safeSerialize(arr))
      expect(result[0]).toBe(1)
      expect(result[1]).toBe(2)
      expect(result[2]).toBe('[Circular]')
    })

    it('handles deeply nested circular references', () => {
      const obj: Record<string, unknown> = {
        level1: {
          level2: {
            level3: {},
          },
        },
      }
      ;(
        (obj.level1 as Record<string, unknown>).level2 as Record<
          string,
          unknown
        >
      ).level3 = obj
      const result = JSON.parse(safeSerialize(obj))
      expect(result.level1.level2.level3).toBe('[Circular]')
    })

    it('handles multiple circular references to same object', () => {
      const shared: Record<string, unknown> = { value: 42 }
      shared.self = shared
      const obj = { a: shared, b: shared }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.a.value).toBe(42)
      expect(result.a.self).toBe('[Circular]')
      expect(result.b).toBe('[Circular]')
    })
  })

  describe('special values', () => {
    it('handles NaN', () => {
      const obj = { value: Number.NaN }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.value).toBe('[NaN]')
    })

    it('handles Infinity', () => {
      const obj = {
        pos: Number.POSITIVE_INFINITY,
        neg: Number.NEGATIVE_INFINITY,
      }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.pos).toBe('[Infinity]')
      expect(result.neg).toBe('[-Infinity]')
    })

    it('handles functions', () => {
      const obj = { fn: () => 42, name: 'test' }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.fn).toBe('[Function]')
      expect(result.name).toBe('test')
    })

    it('handles symbols', () => {
      const obj = { sym: Symbol('test'), name: 'value' }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.sym).toBe('[Symbol: test]')
      expect(result.name).toBe('value')
    })

    it('handles symbols without description', () => {
      const obj = { sym: Symbol() }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.sym).toBe('[Symbol: ]')
    })
  })

  describe('built-in objects', () => {
    it('serializes Date objects', () => {
      const date = new Date('2024-01-15T12:00:00.000Z')
      expect(safeSerialize(date)).toBe('"2024-01-15T12:00:00.000Z"')
    })

    it('serializes RegExp objects', () => {
      const regex = /test/gi
      expect(safeSerialize(regex)).toBe('"/test/gi"')
    })

    it('serializes Error objects', () => {
      const error = new Error('Test error')
      const result = JSON.parse(safeSerialize(error))
      expect(result.name).toBe('Error')
      expect(result.message).toBe('Test error')
      expect(result.stack).toBeDefined()
    })

    it('serializes Map objects', () => {
      const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
      const result = JSON.parse(safeSerialize(map))
      expect(result.key1).toBe('value1')
      expect(result.key2).toBe('value2')
    })

    it('serializes Set objects', () => {
      const set = new Set([1, 2, 3])
      const result = JSON.parse(safeSerialize(set))
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('arrays and objects', () => {
    it('serializes arrays', () => {
      expect(safeSerialize([1, 2, 3])).toBe('[1,2,3]')
    })

    it('serializes nested arrays', () => {
      expect(
        safeSerialize([
          [1, 2],
          [3, 4],
        ]),
      ).toBe('[[1,2],[3,4]]')
    })

    it('serializes plain objects', () => {
      expect(safeSerialize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}')
    })

    it('serializes nested objects', () => {
      const obj = { outer: { inner: { value: 42 } } }
      const result = JSON.parse(safeSerialize(obj))
      expect(result.outer.inner.value).toBe(42)
    })
  })

  describe('max depth option', () => {
    it('respects max depth limit', () => {
      const deepObj = { l1: { l2: { l3: { l4: { l5: 'deep' } } } } }
      const result = JSON.parse(safeSerialize(deepObj, { maxDepth: 3 }))
      // At maxDepth 3: root=0, l1=1, l2=2, l3=3, l4=4 exceeds limit
      expect(result.l1.l2.l3.l4).toBe('[Max Depth Exceeded]')
    })

    it('uses default max depth of 10', () => {
      // Build object with 12 levels of nesting
      let obj: Record<string, unknown> = { value: 'deep' }
      for (let i = 0; i < 12; i++) {
        obj = { nested: obj }
      }
      const result = safeSerialize(obj)
      expect(result).toContain('[Max Depth Exceeded]')
    })
  })

  describe('max length option', () => {
    it('truncates output when exceeding max length', () => {
      const longObj = { data: 'x'.repeat(1000) }
      const result = safeSerialize(longObj, { maxLength: 50 })
      // 50 chars + '...[truncated]' (14 chars) = 64 chars max
      expect(result.length).toBeLessThanOrEqual(64)
      expect(result).toContain('...[truncated]')
    })

    it('does not truncate when within limit', () => {
      const obj = { a: 1 }
      const result = safeSerialize(obj, { maxLength: 100 })
      expect(result).toBe('{"a":1}')
    })
  })

  describe('error handling', () => {
    it('never throws', () => {
      // Even with problematic input, should return a string
      const proxyWithTrap = new Proxy(
        {},
        {
          get() {
            throw new Error('Trap error')
          },
          ownKeys() {
            return ['key']
          },
          getOwnPropertyDescriptor() {
            return { enumerable: true, configurable: true }
          },
        },
      )
      // This should not throw
      const result = safeSerialize(proxyWithTrap)
      expect(typeof result).toBe('string')
    })
  })
})

describe('safeStringify', () => {
  it('returns strings as-is', () => {
    expect(safeStringify('hello')).toBe('hello')
  })

  it('converts numbers to string', () => {
    expect(safeStringify(42)).toBe('42')
    expect(safeStringify(3.14)).toBe('3.14')
  })

  it('converts booleans to string', () => {
    expect(safeStringify(true)).toBe('true')
    expect(safeStringify(false)).toBe('false')
  })

  it('converts BigInt to string with n suffix', () => {
    expect(safeStringify(BigInt(123))).toBe('123n')
  })

  it('converts null to "null"', () => {
    expect(safeStringify(null)).toBe('null')
  })

  it('converts undefined to "undefined"', () => {
    expect(safeStringify(undefined)).toBe('undefined')
  })

  it('serializes objects safely', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj.self = obj
    const result = safeStringify(obj)
    expect(result).toContain('"name":"test"')
    expect(result).toContain('"self":"[Circular]"')
  })

  it('serializes arrays safely', () => {
    const arr = [1, BigInt(2), 'three']
    const result = safeStringify(arr)
    expect(result).toBe('[1,"2n","three"]')
  })
})
