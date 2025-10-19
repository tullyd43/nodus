import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  
  server: {
    port: 3000,
    open: true,  // Auto-open browser
    hot: true,   // Hot module replacement
  },
  
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    rollupOptions: {
      output: {
        // Keep important files separate for debugging
        manualChunks: {
          prosemirror: ['prosemirror-state', 'prosemirror-view', 'prosemirror-model'],
          dexie: ['dexie'],
        }
      }
    }
  }
})