# 开发环境

本项目按开发方案 v1.7 建立 Electron + Vue 3 + TypeScript 开发骨架。后端运行于 Electron 主进程，通过受限 preload API 与渲染进程通信；SQLite 无需单独安装服务。第一阶段已加入本机显示名、窗口状态、数据库迁移和安全 IPC；项目、素材、预算和核心备份业务尚未实现。详见 [阶段验收记录](stage-1.md)。

## 工具版本

使用 Node.js **24.21.0** 与 pnpm **12.10.1**。Node 版本见 `.node-version` / `.nvmrc`，包管理器版本见 `package.json#packageManager`，依赖解析结果见 `pnpm-lock.yaml`。安装依赖需要访问 npm 与 GitHub，安装完成后的桌面壳可离线运行。

当前兼容组合为 Electron **43.8.6**、electron-vite **6.0.0**、Vite **8.3.5**、Vue **3.5.44**、TypeScript **6.0.3**、better-sqlite3 **13.0.3**。TypeScript 7 暂不受所用 Vue/ESLint 工具链支持。原 `lucide-vue-next` 已被维护方弃用，使用其后续包 `@lucide/vue`。

Windows PowerShell 可使用 `pnpm.cmd` 代替 `pnpm`，避免本机执行策略拦截 `pnpm.ps1`。需要新装 pnpm 时使用 `npm.cmd install --global pnpm@12.10.1`；当前机器已经安装，无需重复安装。

## 安装与启动

在项目根目录执行：

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

安装时自动运行 `electron-builder install-app-deps`，使 `better-sqlite3` 匹配 Electron ABI。若升级 Electron、切换平台或出现 `NODE_MODULE_VERSION` 错误，执行：

```powershell
pnpm.cmd run rebuild
```

必须包含 `run`，以免误用 pnpm 内置的 `rebuild` 命令。只有无法取得原生预编译包时才需要 Python 3 和 Visual Studio Build Tools 的“使用 C++ 的桌面开发”工作负载；不要通过关闭 TLS 校验解决下载问题。

如果当前代理环境导致 Electron 的 Node 下载器报 `fetch failed`，Windows 可执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-electron.ps1`。此脚本使用系统 curl 下载同版本官方 ZIP，并用 npm 包内的官方 SHA-256 校验后安装，再执行 `pnpm.cmd run rebuild`。

项目关闭 pnpm 的运行前自动安装（`verifyDepsBeforeRun: false`），确保已安装的开发命令可以离线运行；修改依赖后需显式执行 `pnpm install`。

开发模式的 Vite 热更新服务仅绑定 `127.0.0.1:5173`。这是前端开发工具，应用没有 HTTP 业务后端。生产构建通过本地文件载入页面。

## 验证与常用命令

| 命令                                | 用途                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `pnpm run doctor`                   | 检查 Node、pnpm、Electron、FFmpeg/ffprobe 及 LGPL 标志             |
| `pnpm dev`                          | 启动桌面开发窗口和热更新                                           |
| `pnpm typecheck`                    | 分别检查主进程/preload 和 Vue 的严格类型                           |
| `pnpm lint`                         | ESLint，限制渲染层导入 Node/Electron/SQLite                        |
| `pnpm format` / `pnpm format:check` | 格式化 / 检查格式，保留原有方案与视觉稿格式                        |
| `pnpm build`                        | 类型检查并生成 main/preload/renderer 到 `out/`                     |
| `pnpm start`                        | 启动已经构建的桌面壳                                               |
| `pnpm test`                         | 运行真实 Electron 启动、IPC、SQLite 事务与持久化测试；先运行 build |
| `pnpm test:unit`                    | Vitest 基础单元与 SQLite 迁移集成测试                              |
| `pnpm check`                        | 代码检查、格式检查、构建、Electron 冒烟测试                        |
| `pnpm run pack`                     | 生成当前平台未签名的解包应用                                       |
| `pnpm dist:win`                     | Windows x64 NSIS 内测安装包，不发布                                |
| `pnpm dist:mac`                     | 在 macOS Apple Silicon 上构建 arm64 DMG/ZIP，不发布                |

Playwright 测试直接使用项目的 Electron，无需额外执行 `playwright install` 下载浏览器。测试使用独立临时目录并在结束后清理。当前 better-sqlite3 13 使用 Node-API 预编译包，已验证可在 Node 24 的 Vitest 和 Electron 43 中加载。以后更换原生模块版本或重编译方式时，需重新检查两种运行时兼容性。

## 数据与目录

- `src/main`：生命周期、单实例、数据库、IPC。
- `src/preload`：仅暴露白名单 API；启用 sandbox / contextIsolation，禁用 nodeIntegration。
- `src/renderer`：Vue、Pinia、Vue Router、Naive UI；没有文件系统或数据库权限。
- `src/shared`：类型、通道常量、Zod 契约。
- 开发数据库：`.local/userData/data/moondot.db`，不进入版本控制。
- 正式应用数据库：Windows `%APPDATA%/MoonDot/data/moondot.db`；macOS `~/Library/Application Support/MoonDot/data/moondot.db`。
- `MOONDOT_USER_DATA` 仅在未打包运行时覆盖数据目录，测试用它隔离数据。
- `.pnpm-store`、`.cache`、`node_modules`、`out`、`release` 都是可重建的本地内容。

数据库启用 WAL、外键、`synchronous=FULL` 和 5000ms busy timeout。当前 schema v1 包含 app_settings 和迁移历史，启动时先校验版本与 SQL 校验和，升级前生成在线快照并原子应用迁移。新增业务表需追加编号迁移，不得修改已应用迁移。

素材库和核心备份目录仍应在业务开发时由用户选择。开发环境初始化不会选定素材盘或备份盘。

## FFmpeg

Windows 安装命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-ffmpeg.ps1
pnpm.cmd run doctor
```

脚本安装 FFmpeg 9.0 LGPL shared 构建到 `resources/ffmpeg/win32-x64/`，校验 GitHub 资产摘要，保留 DLL、许可和 `source.json` 来源记录；不修改系统 PATH。详细要求及 macOS 布局见 [FFmpeg 说明](../resources/ffmpeg/README.md)。桌面壳目前尚未调用媒体工具。

## 本机验证记录

2026-11-04，Windows x64：

- 固定锁文件的离线依赖安装成功，依赖 peer 检查无冲突。
- `pnpm run doctor`、严格类型检查、ESLint、Prettier 和生产构建通过。
- Electron 43.8.6 实际启动通过；渲染层通过白名单 IPC 连接主进程 SQLite，无法直接访问 Node API。
- 独立的中文/空格临时目录中，SQLite 持久化、事务回滚、WAL、完整性检查和 FTS5 trigram 验证通过。
- 实际开发模式通过：Vite 在 `http://127.0.0.1:5173/` 提供页面，Electron/preload/数据库连接正常；测试窗口已关闭。
- FFmpeg/ffprobe 9.0 分支 LGPL shared 构建的 SHA-256 与许可证检查通过；成功生成并读取 48 kHz、单声道、0.1 秒 PCM WAV，包含中文和空格的音频路径可用。
- `test-results/` 保存最近一次 Electron 启动截图；Vitest 已可启动，目前没有业务单元测试。

本记录不包含 macOS 实机、安装包、签名或业务功能验收。

## 开发边界和待办

- 已完成第一阶段本地基础实现；外部门禁与当前验收状态以 stage-1.md 为准。
- Git `main` 分支已关联公开远程仓库 https://github.com/defixers/MoonDot；Windows CI 检查与目录构建已通过，macOS 窗口生命周期测试修复待复验，状态见 [第一阶段记录](stage-1.md)。`.gitattributes` 统一文本检出为 LF，避免 Windows 的 `core.autocrlf` 导致格式检查差异。
- 为保留方案要求的 macOS 12 支持，固定使用 Electron 43（Electron 44 起要求 macOS 13）。macOS 仍需在真实 Apple Silicon 设备上验证；后续升级 Electron 前应重新评估最低系统版本。
- SignPath 申请、安装器图标、GitHub 更新通道与完整发行许可材料仍待相应阶段配置；基础迁移已实现。
- 不配置账号、云端、遥测或自动上传。当前骨架未启用自动更新。
