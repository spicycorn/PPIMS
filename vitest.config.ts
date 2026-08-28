import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// 单元测试配置（node 环境，保证 Buffer / fs 可用）
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
