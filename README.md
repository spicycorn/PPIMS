# PPIMS · 个人项目信息管理系统

桌面端工具，把"项目 → 阶段 → 槽位 → 文件"这条主链路管起来：上传模板、按结构识别、
原位编辑 Word/Excel、多版本、状态流转、进度实时重算、检索。

技术栈：Electron + Vue 3 + TypeScript + Vite + Element Plus + Pinia。
详见《个人项目信息管理系统设计文档.md》（唯一事实源）。

---

## 获取与运行（Windows）

1. 在 [Releases](https://github.com/spicycorn/PPIMS/releases) 页面下载便携版：
   `PPIMS-x.y.z-win-x64.exe`
   （若该版本还没打 tag，可到 **Actions → Build & Release → 任意一次成功运行的
   "Upload build artifacts" 步骤**下载同名文件；Actions 产物 90 天后过期，正式版本以 Releases 为准。）
2. 双击 `PPIMS-x.y.z-win-x64.exe` 直接运行 —— **免安装、无残留**（便携版会自解压到
   临时目录并启动，关掉即结束，不写注册表）。

> 便携版与安装版二选一：当前配置产出**便携版**。想切回安装向导见
> `electron-builder.yml` 里 `nsis` 备用的注释块。

### ⚠️ 被"智能拦截"（Windows SmartScreen）挡住？

因为 exe **未做代码签名**，Windows 第一次运行会弹
「Windows 已保护你的电脑 / 智能拦截」之类的蓝色警告。**这是未签名程序的正常现象，不是病毒、不是 bug。**

绕过方法（个人工具，无需花钱买证书）：

- **蓝屏/全屏警告**：点左下角 **「更多信息」** → **「仍要运行」**。
- **小弹窗**：直接点 **「仍要运行 / Run anyway」**。

绕过一次后，Windows 会记住该文件的指纹，后续再点同一个 exe 通常不再拦截
（换版本号/重新打包会重新拦截，属正常）。

> 彻底消除拦截的唯一办法是**代码签名证书**（DigiCert 等，每年数百至上千元）。
> 个人自用没必要；若要分发给他人、想消除警告，再考虑购买并在
> `electron-builder.yml` 配置 `certificateFile` 即可。

### 校验文件完整性（可选但推荐）

Releases / 产物里附带 `SHA256SUMS.txt`。下载 exe 后，在 PowerShell 里核对：

```powershell
cd <exe 所在目录>
Get-FileHash .\PPIMS-x.y.z-win-x64.exe -Algorithm SHA256
```

把输出与 `SHA256SUMS.txt` 里对应那一行的哈希比对，一致即未被篡改。

---

## 开发（可选）

```bash
# 安装依赖（依赖全部落在本目录 node_modules，运行时产物自包含、不依赖 CDN）
pnpm install

# 类型检查 + 单元测试 + 构建（渲染层 Vite + 主进程 esbuild）
pnpm run typecheck
pnpm run test
pnpm run build

# 本地运行 Electron
pnpm run electron:dev
```

打包/发布**只能由 GitHub Actions 触发**（设计文档 §1.5），本地 `electron-builder`
仅用于开发调试。推送代码后 CI 自动跑：安装 → 类型检查 → 测试 → 构建 → 打包便携 exe
→ SHA-256 → 上传产物 → 打 tag 时发布到 Releases。
