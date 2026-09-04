import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// 渲染层（Vue 3 + Element Plus）构建配置。
// 关键：base 用相对路径 './'，保证打包后以 file:// 在 Electron 内加载时资源路径正确，
// 从而在任意 Windows 机器上都能离线加载，不依赖任何网络/CDN。
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./core', import.meta.url)),
      '@shared': fileURLToPath(new URL('./core', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2021',
    // Element Plus / Vue 体积较大，抬高警告阈值，避免无关告警
    chunkSizeWarningLimit: 1600,
    // 多页面：主应用 + 桌面悬浮框
    rollupOptions: {
      input: {
        main: 'index.html',
        traybox: 'tray-box.html',
      },
    },
  },
});
