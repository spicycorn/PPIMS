/**
 * 托盘 + 桌面悬浮框（v1.1.0：缩小到菜单栏功能）。
 *
 * - 托盘图标：主窗口最小化时隐藏到系统托盘；托盘菜单：显示主窗口 / 显示悬浮框 / 退出。
 * - 桌面悬浮框：无边框透明小窗，固定屏幕右侧，罗列"未完成归档项目"（= 未归档 / 进行中）。
 *   "不覆盖任何应用"：alwaysOnTop=false + 定位右下角 + focusable=false，
 *   它在 Z 序底层（被应用遮挡时即只在桌面可见），不抢焦点、不挡应用操作。
 *
 * 渲染层：悬浮框加载 dist/tray-box.html（独立入口，只读项目列表）。
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;
let trayBox: BrowserWindow | null = null;

/** 悬浮框尺寸（右侧窄条）。 */
const BOX_W = 320;
const BOX_H = 420;

/** 创建桌面悬浮框（右侧、底层、不抢焦点）。 */
function createTrayBox(): void {
  if (trayBox && !trayBox.isDestroyed()) {
    trayBox.show();
    trayBox.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: sw } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;

  trayBox = new BrowserWindow({
    width: BOX_W,
    height: BOX_H,
    x: wx + sw - BOX_W - 16, // 屏幕右侧，留 16px 边
    y: wy + 60,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 加载悬浮框页面（独立入口）
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void trayBox.loadURL(`${process.env.VITE_DEV_SERVER_URL}/tray-box.html`);
  } else {
    void trayBox.loadFile(path.join(__dirname, '../dist', 'tray-box.html'));
  }

  trayBox.on('closed', () => {
    trayBox = null;
  });
}

/** 构建托盘菜单。 */
function buildTrayMenu(mainWindow: BrowserWindow): Menu {
  return Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: trayBox && !trayBox.isDestroyed() ? '隐藏悬浮框' : '显示悬浮框',
      click: () => {
        if (trayBox && !trayBox.isDestroyed()) {
          if (trayBox.isVisible()) trayBox.hide();
          else trayBox.show();
        } else {
          createTrayBox();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出 PPIMS',
      click: () => app.quit(),
    },
  ]);
}

/** 初始化托盘（主窗口创建后调用）。 */
export function setupTray(win: BrowserWindow): void {
  if (tray) return;

  // 悬浮框请求"显示主窗口"（点击未归档项目时）
  ipcMain.handle('tray-box:showMain', () => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return { shown: true };
  });

  // 主窗口"最小化到托盘"（隐藏主窗口，从系统托盘调出）
  ipcMain.handle('tray-box:hideMain', () => {
    win.hide();
    return { hidden: true };
  });

  // 托盘图标：用应用图标（public/icon.png）；拿不到则用 1x1 透明占位
  let icon = nativeImage.createEmpty();
  try {
    const iconPath = path.join(app.getAppPath(), 'public', 'icon.png');
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) icon = img.resize({ width: 16, height: 16 });
  } catch {
    /* ignore */
  }

  tray = new Tray(icon);
  tray.setToolTip('PPIMS · 个人项目信息管理系统');
  tray.setContextMenu(buildTrayMenu(win));

  // 左键单击：显示/隐藏主窗口
  tray.on('click', () => {
    if (win.isVisible() && !win.isMinimized()) {
      win.hide();
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}
