import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'

export default defineConfig({
  base: '/app/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Issue #66: Configure minification for CSP-compatible production builds
    // Vue production builds don't require eval when properly minified
    minify: 'terser',
    terserOptions: {
      compress: {
        // Remove console.log in production for better security
        drop_console: true,
        // Additional compression for smaller bundle size
        passes: 2
      },
      format: {
        // Remove comments in production
        comments: false
      }
    },
    // Generate source maps for debugging (optional, can be disabled for production)
    sourcemap: false
  }
})
