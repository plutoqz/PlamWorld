import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@engines': path.resolve(__dirname, 'src/engines'),
      '@sources': path.resolve(__dirname, 'src/sources'),
      '@stores': path.resolve(__dirname, 'src/stores'),
      '@tools': path.resolve(__dirname, 'src/tools'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@workers': path.resolve(__dirname, 'src/workers'),
      '@data': path.resolve(__dirname, 'src/data'),
    },
  },
});
