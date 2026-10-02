import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'server-only': new URL('./tests/helpers/server-only.ts', import.meta.url)
        .pathname,
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    server: { deps: { inline: ['next-auth'] } },
  },
})
