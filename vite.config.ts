import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Path alias for clean imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src-react'),
    },
  },

  // Prevent vite from obscuring rust errors
  clearScreen: false,
  
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    strictPort: true,
    port: 5173,
  },
  
  // To make use of TAURI_PLATFORM, TAURI_ARCH, etc.
  envPrefix: ['VITE_', 'TAURI_'],
  
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
