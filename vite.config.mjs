import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:4329', changeOrigin: true } } },
  build: { rolldownOptions: { output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three' : undefined } } },
});
