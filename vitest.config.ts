import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/noop.ts', '**/index.ts'],
    },
  },
})
