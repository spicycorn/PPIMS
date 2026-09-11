# PPIMS · 个人项目信息管理系统（v1.2.7）

桌面端工具，把"项目 → 插槽树（阶段可嵌套）→ 文件"这条归档主链路管起来：
**套用预置结构模板**（软件自带"岩土勘察项目（标准）"，开箱即用）+ 新字段表单建项（类型自由输入）、
多文件上传（重名自动加序号）、**动态格式识别**（任意格式）、文件**自定义标签**（重要/已核…）、
**外部预览/编辑**（系统程序打开 Word/Excel）+ 下载、检索、**托盘 + 桌面悬浮框**（缩小到菜单栏，
**右上角**悬浮"未完成归档项目"，**设置菜单**含开机自启/关闭行为）、**可扩展多维分类**（地区/专业/客户…）。

> **v1.2.7**：四项完善——
> ① **预置模板一次性种入**：旧版每次重启都按"名"把默认模板重新加回（删除后重启又复活）；现按预置稳定 key 记录"已种过"（存设置），
>    只种一次，删除后不再复活（升级兼容：旧版已按名种过的只补记 key，不重复创建）。
> ② **悬浮窗实时显示未归档项目**：旧版只启动时读一次，同一次运行内归档/新建项目不刷新；现主进程在 新建/套模板建项/保存(含归档开关)/改信息/删除
>    项目后广播 `projects:changed`，悬浮窗订阅后实时重取列表。
> ③ **悬浮窗点击导航**：点击某项目 → 主窗口打开该项目管理界面；点击"打开主窗口" → 主窗口回项目列表（主进程转发 `main:navigate`，主窗口据此导航）。
> ④ **新建项目改按钮+对话框**：原"项目总体界面"右侧常驻大表单，现改为点"新建项目"按钮弹出对话框填写；
>    并去除"地区""项目阶段"两个字段（改由"分类维度"自定义承载，避免与维度功能重复）。
>
> **v1.2.6**：修复"结构模板库"编辑/新建保存报 "An object could not be cloned"——根因同 v1.2.5：模板草稿是 Vue reactive 树，
> `saveEditor` 把它直接过 Electron IPC 无法结构化克隆。现落盘前 JSON 深克隆成纯对象再过 IPC。
> 并对全项目所有"保存/落盘"路径做审计，统一"reactive 状态→深克隆成纯对象→再过 IPC"的规矩（项目保存、维度保存、模板保存均已符合）。
>
> **v1.2.5**：修复"分类维度"无法保存（设置过的维度每次返回列表页都丢失）——根因：维度定义是 Vue reactive Proxy，
> `saveDimensions` 直接把它过 Electron IPC 触发 "An object could not be cloned"（与 v1.2.2 保存同一根因，当时只修了项目保存、漏了维度保存），
> 落盘前静默失败 → 维度只存内存、从未写入 `<root>/ppims.json`。现落盘前 JSON 深克隆成纯对象再过 IPC，增/删/改名维度真正持久化。
>
> **v1.2.4**：项目"完成归档"改显式开关——项目界面"标记已归档 / 取消归档"一键翻转（取代旧"阶段关键词"启发式，零误判）；
> 右上角"未完成归档项目"悬浮窗只列未归档项目；项目列表新增"状态"列（已归档 / 进行中）。
>
> **v1.2.3**：交互优化——"添加子插槽"并入左侧插槽操作行（悬停显示，更隐蔽，操作行=添加/上移/下移/改名/删除）；
> 右区移除"添加子插槽"按钮（只留文件管理 + 子插槽展示）；左侧"插槽树"更名"项目归档列表"；所有插槽选择/添加/删除统一在左侧完成。
>
> **v1.2.2**：修复保存报 "An object could not be cloned"（Vue reactive 对象过 Electron IPC 无法克隆，现深克隆成纯对象）；
> 存储模型改"嵌套镜像"——插槽树直接映射为磁盘目录（项目/阶段1/文件.docx、项目/阶段1/子插槽/文件.pdf），所见即所得；
> 加插槽建文件夹 / 删插槽删文件夹（含子插槽 + 全部文件）/ 改插槽名移文件夹（级联更新文件路径）；上传存入所属插槽文件夹；
> 任何插槽/文件变动实时落盘；删文件 / 删插槽功能齐备（物理删除）；加载旧项目（扁平 files/）自动迁移到嵌套结构。
>
> **v1.2.1**：修复项目保存"假成功"（persist 静默 return 时仍弹"已保存"，现据实提示）；
> 修复模板建项结构目录（去掉绝对路径，项目可搬移，与 IPC 建项对齐）；
> 新增悬浮窗与主窗口互斥（主窗口显示/聚焦时右上角悬浮窗同时消失，不再两窗并存）。
>
> **v1.2.0**：修复托盘图标无图像 + 悬浮框未正常展示（改右上角 + fade-in 平滑 + 不抢焦点）；
> 新增托盘设置菜单（开机自启 + 点关闭缩小到菜单栏）+ 彻底退出（含后台）；
> 新建项目"类型"改自由输入（专业方向级：岩土/物探/测量…）；删项目界面"最小化"按钮（统一到设置菜单）。
>
> **v1.1.0**：删除内置编辑（只做外部预览/编辑）；新增预置模板、托盘 + 桌面悬浮框、启动优化。
>
> **v1.0.0**：定位改为"归档已完成文件、分类管理"；删除状态流转/必要性/版本号/进度/固定格式枚举；
> 新增插槽嵌套/文件标签/动态格式/结构模板。

技术栈：Electron + Vue 3 + TypeScript + Vite + Element Plus + Pinia。
详见《[PPIMS-设计文档.md](docs/PPIMS-设计文档.md)》（唯一事实源）。

**应用图标**：可爱小人整理文件夹，`public/` 下由 `dev/scripts/gen-icon.mjs`（矢量绘图 + 纯 Node 手写 PNG 编码，零依赖）生成，
`dev/scripts/derive-icons.mjs` 派生多尺寸 PNG 与 `icon.ico`（16/32/48/256）。
窗口标题栏/任务栏、浏览器 favicon、Windows exe 图标均用它。重新生成：`pnpm run icons`。

### 目录结构

```
PPIMS/
├─ core/                # 核心管理层：types / paths / classify / template-mapping / util / presets（纯逻辑）
│   ├─ services/        #   主进程服务：结构模板服务、fs（v1.1.0 删 csv·docx·xlsx 引擎）
│   ├─ stores/          #   状态（app / project，Pinia）
│   ├─ main / preload / ipc / ipc-channels / tray   # Electron 主进程 + 托盘 + 桥接
│   └─ App.vue / app-main.ts / tray-box-main.ts / style.css / api.d.ts   # 渲染层骨架
├─ features/            # 功能层（Vue 3 + Element Plus UI 组件）：
│                      #   ProjectList / ProjectDetail / SlotTreePanel / SlotWorkspace /
│                      #   FilePanel / TrayBox / TemplateManager / SearchPanel / SlotStructureEditor
├─ dev/                 # scripts（build-electron、gen-icon、derive-icons）
├─ public/              # 应用图标（icon.png / icon-*.png / icon.ico）
├─ docs/                # 设计文档（PPIMS-设计文档.md，唯一事实源）
├─ .github/             # CI（Build & Release，Actions 触发打包/发布）
├─ index.html           # Vite 主应用入口（含 favicon）
├─ tray-box.html        # Vite 桌面悬浮框入口（v1.1.0 托盘悬浮框）
├─ electron-builder.yml # 打包配置（图标、便携 exe、代码签名、发布）
├─ package.json         # 依赖与脚本
└─ *.config / tsconfig               # Vite / 类型
```

> 分层原则：`core/` 是核心管理层（纯逻辑 + 主进程 + 状态 + 渲染骨架），`features/` 是功能层（UI 组件）；
> `core/` 里的纯逻辑（types / paths / classify / template-mapping / util / presets）无 electron 依赖，
> 渲染层与主进程都能安全 import。重复的 fs/助手统一收到 `core/services/fs.ts`、`core/util.ts`、
> `core/template-mapping.ts`，避免各写一份。**无死代码**：格式动态识别（任意格式），不做固定枚举；
> v1.1.0 删除内置编辑引擎（csv/docx/xlsx），文件预览/编辑交给外部系统程序。

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

# 类型检查 + 构建（渲染层 Vite + 主进程 esbuild）
pnpm run typecheck
pnpm run build

# 重新生成应用图标（可爱小人整理文件夹）
pnpm run icons

# 本地运行 Electron：一个终端跑 `pnpm run dev`（起 Vite），另一个终端跑：
pnpm run dev:electron
```

打包/发布**只能由 GitHub Actions 触发**（设计文档 §1.5），本地 `electron-builder`
仅用于开发调试。推送代码后 CI 自动跑：安装 → 类型检查 → 构建 → 打包便携 exe
→ SHA-256 → 上传产物 → 打 tag 时发布到 Releases。
