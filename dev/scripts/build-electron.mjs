// 用 esbuild 编译 Electron 主进程与预加载脚本到 dist-electron/。
// 策略：把主进程用到的第三方库（jszip / exceljs / xlsx / archiver）一并 bundle 进 main.js，
// 使最终 Electron 产物在运行时不依赖 node_modules —— 最大化可移植性、自包含、跨机器可用。
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rmSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outdir = path.join(root, 'dist-electron');

// 这些库在运行时由 Electron 提供或属于 node 内置，不能作为 bundle 依赖
const external = ['electron'];

rmSync(outdir, { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  external,
  outdir,
  // 主进程代码里用到的 node 内置模块保持 external（esbuild 对 platform=node 会自动处理，
  // 这里显式声明以防个别包以 ESM 方式 require 内置模块时出问题）
};

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'core', 'main.ts')],
    outdir,
  }),
  esbuild.build({
    ...common,
    entryPoints: [path.join(root, 'core', 'preload.ts')],
    outdir,
    // preload 运行在 contextIsolation 环境，禁止被 bundle 进外部依赖
  }),
]);

console.log('[build-electron] done → dist-electron/');
