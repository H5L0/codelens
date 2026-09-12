import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 前端源码放在 src/web，构建产物输出到 dist/web，由 CLI 直接托管。
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5179,
  },
});
