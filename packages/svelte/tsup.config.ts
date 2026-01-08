import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/noop.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['svelte', 'svelte/store', '@deepnoodle/xray-core'],
})
