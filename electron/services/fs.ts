/**
 * 主进程共享的 fs 助手（ipc.ts 与 template-service.ts 共用，避免各写一份）。
 * 全部基于 node:fs promises，离线可用。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 递归建目录 */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** 复制文件（自动建目标父目录） */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}
