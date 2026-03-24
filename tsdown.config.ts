import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/client.ts',
    './src/server.ts',
  ],
  dts: true,
  exports: true,
})
