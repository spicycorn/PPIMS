# PPIMS · 个人项目信息管理系统（v1.0.0 个人归档版）

桌面端工具，把"项目 → 插槽树（阶段可嵌套）→ 文件"这条归档主链路管起来：
**套用结构模板** + 新字段表单建项、多文件上传（重名自动加序号）、**动态格式识别**（任意格式）、
文件**自定义标签**（重要/已核…）、**原位编辑** csv/Word/Excel（保真，只换文本不动样式）、
doc/xls 查看 + 系统打开、检索，以及**可扩展多维分类**（地区/专业/客户…，视图层分组/筛选/排序）。

> v1.0.0 定位从"项目完成度 + 审核流转 + 多版本"改为"**归档已完成文件、分类管理**"：
> 删除文件状态流转 / 必要性 / 版本号 / 进度 / 固定格式枚举；新增插槽嵌套 / 文件标签 / 动态格式 / 结构模板。

技术栈：Electron + Vue 3 + TypeScript + Vite + Element Plus + Pinia。
详见《[PPIMS-设计文档.md](docs/PPIMS-设计文档.md)》（唯一事实源）。

**应用图标**：可爱小人整理文件夹，`public/` 下由 `dev/scripts/gen-icon.mjs`（矢量绘图 + 纯 Node 手写 PNG 编码，零依赖）生成，
`dev/scripts/derive-icons.mjs` 派生多尺寸 PNG 与 `icon.ico`（16/32/48/256）。
窗口标题栏/任务栏、浏览器 favicon、Windows exe 图标均用它。重新生成：`pnpm run icons`。

### 目录结构

```
PPIMS/
├─ core/                # 核心管理层：types / paths / classify / template-mapping / util（纯逻辑）
│   ├─ services/        #   主进程服务：docx·xlsx·csv 引擎、结构模板服务、fs
│   ├─ stores/          #   状态（app / project，Pinia）
│   ├─ main / preload / ipc / ipc-channels   # Electron 主进程与桥接
│   └─ App.vue / app-main.ts / style.css / api.d.ts   # 渲染层骨架
├─ features/            # 功能层（Vue 3 + Element Plus UI 组件）：
│                      #   ProjectList / ProjectDetail / SlotTreePanel / SlotWorkspace /
│                      #   FilePanel / FileEditor / TemplateManager / SearchPanel / SlotStructureEditor
├─ dev/                 # 非 GitHub 相关：test（unit.test.ts + run-standalone.ts）+ scripts（build-electron、gen-icon、derive-icons）
├─ public/              # 应用图标（icon.png / icon-*.png / icon.ico）
├─ docs/                # 设计文档（PPIMS-设计文档.md，唯一事实源）
├─ .github/             # CI（Build & Release，Actions 触发打包/发布）
├─ index.html           # Vite 入口（含 favicon）
├─ electron-builder.yml # 打包配置（图标、便携 exe、签名占位、发布）
├─ package.json         # 依赖与脚本
└─ *.config / tsconfig / vitest.config   # Vite / 类型 / 测试配置
```

> 分层原则：`core/` 是核心管理层（纯逻辑 + 主进程 + 状态 + 渲染骨架），`features/` 是功能层（UI 组件）；
> `core/` 里的纯逻辑（types / paths / classify / template-mapping / util / csv-engine）无 electron 依赖，
> 渲染层与主进程都能安全 import。重复的 fs/助手统一收到 `core/services/fs.ts`、`core/util.ts`、
> `core/template-mapping.ts`，避免各写一份。**无死代码**：格式动态识别（任意格式），不做固定枚举。

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

# 重新生成应用图标（可爱小人整理文件夹）
pnpm run icons

# 本地运行 Electron：一个终端跑 `pnpm run dev`（起 Vite），另一个终端跑：
pnpm run dev:electron
```

打包/发布**只能由 GitHub Actions 触发**（设计文档 §1.5），本地 `electron-builder`
仅用于开发调试。推送代码后 CI 自动跑：安装 → 类型检查 → 测试 → 构建 → 打包便携 exe
→ SHA-256 → 上传产物 → 打 tag 时发布到 Releases。
