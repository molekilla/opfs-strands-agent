import { defineConfig } from 'vite'

export default defineConfig({
  // Allow Vite to serve all three examples as separate entry points.
  // Run `npm run dev` then open:
  //   http://localhost:5173/              (main demo)
  //   http://localhost:5173/examples/vanilla/
  build: {
    rollupOptions: {
      input: {
        main:    'index.html',
        vanilla: 'examples/vanilla/index.html',
      },
    },
  },
  optimizeDeps: {
    exclude: ['opfs-worker'],
  },
  worker: {
    format: 'es',
  },
})
