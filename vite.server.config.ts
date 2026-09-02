import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'server/orgmasterServer.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'server.mjs',
      },
    },
  },
})
