import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ensure a single instance of three is loaded. Without this,
    // @react-three/postprocessing pulls its own copy and Three objects
    // from different instances don't recognize each other → blank render.
    dedupe: ['three'],
  },
  optimizeDeps: {
    // Force Vite to pre-bundle postprocessing against our single three.
    include: ['three'],
  },
})
