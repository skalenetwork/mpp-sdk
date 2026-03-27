import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/client/index.ts',
    './src/server/index.ts',
  ],
  dts: true,
  exports: true,
})
