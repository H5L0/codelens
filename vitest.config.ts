import { defineConfig } from 'vitest/config';

// 前端源码根在 src/web，单元测试按源码同级放置，这里单独给出测试配置避免被 vite.config.ts 的 root 影响。
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
