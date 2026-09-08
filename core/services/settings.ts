/**
 * 应用设置服务（主进程，持久化到 userData）。
 *
 * - closeToTray（点关闭缩小到菜单栏）：点主窗口"×"时是隐藏到托盘还是真正退出。
 * - autoStart（开机自启）：由 Electron loginItem 管理（app.setLoginItemSettings），
 *   本服务只读取当前状态供菜单勾选显示。
 *
 * 说明：无硬编码业务值；设置是用户偏好，存 userData（可搬移、不污染项目数据）。
 */
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface AppSettings {
  /** 点主窗口"×"时隐藏到托盘（true）还是退出（false）。默认 true。 */
  closeToTray: boolean;
}

const DEFAULTS: AppSettings = { closeToTray: true };

function configPath(): string {
  return path.join(app.getPath('userData'), 'ppims-settings.json');
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
}

/** 读取设置（缺失项用默认值补齐）。 */
export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(configPath(), 'utf-8');
    const data = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULTS, ...data };
  } catch {
    return { ...DEFAULTS };
  }
}

/** 写入设置（合并，保留其它项）。 */
export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...patch };
  const p = configPath();
  await ensureDir(p);
  await fs.writeFile(p, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

/** 切换"点关闭缩小到菜单栏"，返回切换后的完整设置。 */
export async function toggleCloseToTray(): Promise<AppSettings> {
  const current = await getSettings();
  return saveSettings({ closeToTray: !current.closeToTray });
}

/** 读取"开机自启"当前状态（Electron loginItem 管理）。 */
export function getAutoStart(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

/** 设置"开机自启"（Electron loginItem 管理），返回设置后的状态。 */
export function setAutoStart(on: boolean): boolean {
  app.setLoginItemSettings({ openAtLogin: on });
  return app.getLoginItemSettings().openAtLogin;
}
