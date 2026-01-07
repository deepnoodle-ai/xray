/**
 * Safe JSON serializer that handles circular references, BigInt values,
 * and other edge cases that would cause JSON.stringify to throw.
 */

export interface SafeSerializeOptions {
  /** Maximum depth to traverse (default: 10) */
  maxDepth?: number
  /** Maximum string length in output (default: unlimited) */
  maxLength?: number
}

const DEFAULT_OPTIONS: Required<SafeSerializeOptions> = {
  maxDepth: 10,
  maxLength: 0, // 0 means unlimited
}

/**
 * Safely serialize a value to JSON string, handling:
 * - Circular references (replaced with "[Circular]")
 * - BigInt values (converted to string with "n" suffix, e.g., "123n")
 * - Undefined (converted to null in arrays, omitted in objects per JSON spec)
 * - Functions (replaced with "[Function]")
 * - Symbols (replaced with "[Symbol]")
 *
 * This function never throws - it catches errors and returns a fallback string.
 *
 * @param value - The value to serialize
 * @param options - Optional configuration for depth and length limits
 * @returns JSON string representation
 */
export function safeSerialize(
  value: unknown,
  options: SafeSerializeOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  try {
    const seen = new WeakSet<object>()

    const serialize = (val: unknown, depth: number): unknown => {
      // Handle depth limit
      if (depth > opts.maxDepth) {
        return '[Max Depth Exceeded]'
      }

      // Handle primitives and special values
      if (val === null) return null
      if (val === undefined) return null
      if (typeof val === 'boolean') return val
      if (typeof val === 'number') {
        if (Number.isNaN(val)) return '[NaN]'
        if (!Number.isFinite(val)) return val > 0 ? '[Infinity]' : '[-Infinity]'
        return val
      }
      if (typeof val === 'string') return val
      if (typeof val === 'bigint') return `${val}n`
      if (typeof val === 'function') return '[Function]'
      if (typeof val === 'symbol') return `[Symbol: ${val.description ?? ''}]`

      // Handle objects
      if (typeof val === 'object') {
        // Check for circular reference
        if (seen.has(val)) {
          return '[Circular]'
        }
        seen.add(val)

        try {
          // Handle arrays
          if (Array.isArray(val)) {
            return val.map((item) => serialize(item, depth + 1))
          }

          // Handle Date
          if (val instanceof Date) {
            return val.toISOString()
          }

          // Handle Error
          if (val instanceof Error) {
            return {
              name: val.name,
              message: val.message,
              stack: val.stack,
            }
          }

          // Handle RegExp
          if (val instanceof RegExp) {
            return val.toString()
          }

          // Handle Map
          if (val instanceof Map) {
            const obj: Record<string, unknown> = {}
            val.forEach((v, k) => {
              const key = typeof k === 'string' ? k : String(k)
              obj[key] = serialize(v, depth + 1)
            })
            return obj
          }

          // Handle Set
          if (val instanceof Set) {
            return Array.from(val).map((item) => serialize(item, depth + 1))
          }

          // Handle plain objects
          const result: Record<string, unknown> = {}
          for (const key of Object.keys(val)) {
            try {
              const propValue = (val as Record<string, unknown>)[key]
              result[key] = serialize(propValue, depth + 1)
            } catch {
              result[key] = '[Unserializable]'
            }
          }
          return result
        } finally {
          // Remove from seen after processing to allow same object in different branches
          // Actually, keep it to handle true circular refs - removing would miss them
          // seen.delete(val) - intentionally not removing
        }
      }

      return '[Unknown Type]'
    }

    const processed = serialize(value, 0)
    let result = JSON.stringify(processed)

    // Apply max length if specified
    if (opts.maxLength > 0 && result.length > opts.maxLength) {
      result = `${result.slice(0, opts.maxLength)}...[truncated]`
    }

    return result
  } catch (error) {
    // Final fallback - should rarely happen
    try {
      return `[Serialization Error: ${error instanceof Error ? error.message : String(error)}]`
    } catch {
      return '[Serialization Error]'
    }
  }
}

/**
 * Safely serialize a value for display in console messages.
 * Converts objects to JSON strings, leaves primitives as strings.
 *
 * @param value - The value to stringify
 * @param options - Optional configuration
 * @returns String representation suitable for console output
 */
export function safeStringify(
  value: unknown,
  options: SafeSerializeOptions = {},
): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'bigint') return `${value}n`
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  return safeSerialize(value, options)
}
