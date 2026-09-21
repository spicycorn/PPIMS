/**
 * Electron 主进程入口。
 * - 创建窗口：开发态加载 Vite dev server，生产态加载 dist/index.html（file://）。
 * - 注册全部 IPC（文件/项目/Word/Excel/导入/对话框）。
 * - 安全基线：contextIsolation 开、nodeIntegration 关、preload 桥接。
 */
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { registerIpc } from './ipc';
import { seedPresetTemplates } from './services/template-service';
import { setupTray } from './tray';

// 资源根目录：打包后为 app.asar 内，开发态为项目根
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DIST = path.join(__dirname, '../dist');
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    title: 'PPIMS · 个人项目信息管理系统',
    // 应用图标：可爱小人整理文件夹（public/ 下；Windows 窗口标题栏/任务栏生效）
    icon: path.join(app.getAppPath(), 'public', 'icon.png'),
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    // 先隐藏窗口：等首帧渲染完成（ready-to-show）再 show（v1.2.8 修复"开机自启文字对不齐"）。
    // 默认 show:true 会在页面仍在加载/布局时就可见；手动启动时机器空闲、首帧瞬间完成故无感，
    // 但开机自启时机下系统字体尚未度量完成，首帧用回退字体布局 → el-table 行高/列/文本基线错位。
    // 与 core/tray.ts 悬浮框"show:false → 加载完再显示"的做法保持一致。
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  mainWindow = win;

  // 外链一律交给系统浏览器，不在应用内打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && DEV_URL) {
    void win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(DIST, 'index.html'));
  }

  // 首帧渲染完成（字体已就绪、布局已定型）再显示窗口。
  // 兜底：极端情况 ready-to-show 未触发（如加载异常）时，3s 后强制显示，避免窗口一直不出现。
  let shown = false;
  const doShow = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    if (!win.isVisible()) win.show();
  };
  win.once('ready-to-show', doShow);
  const fallback = setTimeout(() => {
    win.removeListener('ready-to-show', doShow);
    doShow();
  }, 3000);
  if (typeof fallback.unref === 'function') fallback.unref();

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

// 单实例锁：避免多开导致 project.json 写冲突
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // 启动时种入预置模板（软件自带一套，开箱即用，幂等）
    void seedPresetTemplates().catch(() => {});

    registerIpc();
    const win = createWindow();
    // 托盘 + 桌面悬浮框（缩小到菜单栏功能）
    setupTray(win);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const w = createWindow();
        setupTray(w);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
