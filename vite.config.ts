import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ['opfs-worker'],
  },
  worker: {
    format: 'es',
  },
})
