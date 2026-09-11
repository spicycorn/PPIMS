/**
 * 托盘 + 桌面悬浮框（v1.2.0：缩小到菜单栏 + 设置 + 右上角悬浮 + 彻底退出）。
 *
 * - 托盘图标：正确加载应用图标（多候选路径，开发/打包都可用）。
 * - 托盘菜单：显示主窗口 / 显示·隐藏悬浮框 / 开机自启（toggle）/ 点关闭缩小到菜单栏（toggle）/ 退出。
 * - 桌面悬浮框：无边框透明小窗，固定屏幕"右上角"，罗列"未完成归档项目"。
 *   "不覆盖任何应用"：alwaysOnTop=false + focusable=false，它在 Z 序底层（被应用遮挡时只在桌面可见）。
 *   平滑展示：先 showInactive（不抢焦点），渲染层做 CSS fade-in 动画。
 * - 互斥（v1.2.1）：主窗口与悬浮框不能同时存在——主窗口"显示/聚焦"（任何方式）→ 悬浮框隐藏。
 * - 关闭行为：
 *   - "点关闭缩小到菜单栏"开启时，点主窗口"×"→ 隐藏到托盘（不退出）+ 显示悬浮框。
 *   - "点关闭缩小到菜单栏"关闭时，点主窗口"×"→ 退出（彻底关闭，含后台）。
 *   - 托盘菜单"退出 PPIMS"→ 始终彻底退出（含后台）。
 *
 * 渲染层：悬浮框加载 dist/tray-box.html（独立入口，只读项目列表 + fade-in 动画）。
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } from 'electron';
import path from 'node:path';
import { getSettings, toggleCloseToTray, getAutoStart, setAutoStart } from './services/settings';
import { IPC } from './ipc-channels';

let tray: Tray | null = null;
let trayBox: BrowserWindow | null = null;
let mainWin: BrowserWindow | null = null;
let forceQuit = false;

/** 悬浮框尺寸。 */
const BOX_W = 320;
const BOX_H = 420;

/** 加载托盘图标（多候选路径，开发/打包都可用，拿不到则返回空图）。 */
function loadTrayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(__dirname, '../dist', 'icon.png'),
    path.join(app.getAppPath(), 'dist', 'icon.png'),
    path.join(app.getAppPath(), 'public', 'icon.png'),
  ];
  for (const p of candidates) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
    } catch {
      /* 试下一个 */
    }
  }
  return nativeImage.createEmpty();
}

/** 悬浮框位置（右上角，留 16px 边）。 */
function trayBoxPosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  const { width: sw } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;
  return { x: wx + sw - BOX_W - 16, y: wy + 16 };
}

/** 显示悬浮框（已存在则 showInactive，不抢焦点；不存在则创建）。 */
function showTrayBox(): void {
  if (trayBox && !trayBox.isDestroyed()) {
    if (!trayBox.isVisible()) {
      const pos = trayBoxPosition();
      trayBox.setPosition(pos.x, pos.y);
      trayBox.showInactive(); // 不抢焦点，渲染层做 fade-in
    }
    return;
  }

  const pos = trayBoxPosition();
  trayBox = new BrowserWindow({
    width: BOX_W,
    height: BOX_H,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false, // 先隐藏，加载完再 showInactive（配合渲染层 fade-in）
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void trayBox.loadURL(`${process.env.VITE_DEV_SERVER_URL}/tray-box.html`);
  } else {
    void trayBox.loadFile(path.join(__dirname, '../dist', 'tray-box.html'));
  }

  trayBox.webContents.on('did-finish-load', () => {
    trayBox?.showInactive(); // 加载完显示（不抢焦点），渲染层 fade-in
  });

  trayBox.on('closed', () => {
    trayBox = null;
  });
}

/** 隐藏悬浮框。 */
function hideTrayBox(): void {
  if (trayBox && !trayBox.isDestroyed() && trayBox.isVisible()) {
    trayBox.hide();
  }
}

/** 彻底退出（主窗口 + 悬浮窗 + 托盘 + 后台，不留残余）。 */
function quitApp(): void {
  forceQuit = true;
  // 关闭悬浮框（防止 window-all-closed 后残余）
  if (trayBox && !trayBox.isDestroyed()) trayBox.destroy();
  trayBox = null;
  app.quit();
}

/** 同步设置缓存（close 事件里同步读，避免 async）。 */
let settingsCache: { closeToTray: boolean } = { closeToTray: true };

function readSettingsSync(): { closeToTray: boolean } {
  return settingsCache;
}

/** 重建托盘菜单（读当前设置状态，勾选显示，并更新同步缓存）。 */
async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return;
  const settings = await getSettings();
  settingsCache = settings; // 更新同步缓存（close 事件用）
  const autoStart = getAutoStart();

  const menu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWin) {
          if (mainWin.isMinimized()) mainWin.restore();
          mainWin.show();
          mainWin.focus();
        }
      },
    },
    {
      label: trayBox && !trayBox.isDestroyed() && trayBox.isVisible() ? '隐藏悬浮框' : '显示悬浮框',
      click: () => {
        if (trayBox && !trayBox.isDestroyed() && trayBox.isVisible()) hideTrayBox();
        else showTrayBox();
        void rebuildTrayMenu(); // 更新菜单文案
      },
    },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: autoStart,
      click: () => {
        const next = !autoStart;
        setAutoStart(next);
        void rebuildTrayMenu();
      },
    },
    {
      label: '点关闭缩小到菜单栏',
      type: 'checkbox',
      checked: settings.closeToTray,
      click: () => {
        void toggleCloseToTray();
        void rebuildTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '退出 PPIMS',
      click: () => quitApp(),
    },
  ]);

  tray.setContextMenu(menu);
}

/** 初始化托盘（主窗口创建后调用）。 */
export function setupTray(win: BrowserWindow): void {
  if (tray) return;
  mainWin = win;

  // 悬浮框请求"显示主窗口 + 导航"——互斥：主窗口出现，悬浮窗同时消失。
  // folder 非空 → 主窗口打开该项目；folder 空 → 主窗口回项目列表。
  ipcMain.handle('tray-box:showMain', (_e, folder?: string) => {
    hideTrayBox(); // 显式隐藏悬浮窗（主窗口出现即互斥）
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
      // 通知主窗口渲染层导航（打开指定项目 / 回列表）
      mainWin.webContents.send(IPC.MAIN_NAVIGATE, { folder: folder ?? '' });
    }
    return { shown: !!mainWin };
  });

  // 互斥：主窗口"显示/聚焦"（任何方式——托盘点击·showMain·其他）→ 隐藏悬浮窗
  win.on('show', () => hideTrayBox());
  win.on('focus', () => hideTrayBox());

  // 主窗口"关闭"事件：根据 closeToTray 设置决定隐藏到托盘还是退出
  win.on('close', (e) => {
    // 显式退出（托盘"退出 PPIMS"）→ 放行
    if (forceQuit) return;
    // 读取 closeToTray 设置（同步读缓存，避免异步）
    const settings = readSettingsSync();
    if (settings.closeToTray) {
      // 隐藏到托盘（不退出），同时显示悬浮框
      e.preventDefault();
      win.hide();
      showTrayBox();
    }
    // closeToTray=false → 不 preventDefault，正常关闭（window-all-closed 触发 app.quit）
  });

  // 主窗口"关闭"后如果还有悬浮框，确保退出时都关
  win.on('closed', () => {
    if (mainWin === win) mainWin = null;
  });

  // 托盘图标
  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('PPIMS · 个人项目信息管理系统');
  void rebuildTrayMenu();

  // 左键单击：显示/隐藏主窗口
  tray.on('click', () => {
    if (!mainWin) return;
    if (mainWin.isVisible() && !mainWin.isMinimized()) {
      mainWin.hide();
    } else {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });
}


