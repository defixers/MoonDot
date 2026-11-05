# 开发环境

本项目按开发方案 v1.8 维护 Electron + Vue 3 + TypeScript 桌面应用，Windows 发布路径为 Microsoft Store/MSIX。后端运行于 Electron 主进程，通过受限 preload API 与渲染进程通信；SQLite 无需单独安装服务。第二阶段已重做为五步项目向导、固定五阶段文件管理、七天项目回收站和项目/备注/人员搜索；音频素材库、预算和核心备份仍属后续阶段。详见 [第二阶段验收记录](stage-2.md) 和 [第一阶段历史记录](stage-1.md)。

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
| `pnpm run msix:check`               | 校验 Partner Center 包身份和 MSIX 配置，不构建或提交               |
| `pnpm dist:win`                     | 构建 Windows x64 MSIX 提交包，需配置 Store 身份；不签名、不发布    |
| `pnpm dist:mac`                     | 在 macOS Apple Silicon 上构建 arm64 DMG/ZIP，不发布                |

Playwright 测试直接使用项目的 Electron，无需额外执行 `playwright install` 下载浏览器。测试使用独立临时目录并在结束后清理。当前 better-sqlite3 13 使用 Node-API 预编译包，已验证可在 Node 24 的 Vitest 和 Electron 43 中加载。以后更换原生模块版本或重编译方式时，需重新检查两种运行时兼容性。

## 数据与目录

- `src/main`：生命周期、单实例、数据库、IPC。
- `src/preload`：仅暴露白名单 API；启用 sandbox / contextIsolation，禁用 nodeIntegration。
- `src/renderer`：Vue、Pinia、Vue Router、Naive UI；没有文件系统或数据库权限。
- `src/shared`：类型、通道常量、Zod 契约。
- 开发数据库：`.local/userData/data/moondot-remake.db`，不进入版本控制。
- 正式应用数据库：Windows `%APPDATA%/MoonDot/data/moondot-remake.db`；macOS `~/Library/Application Support/MoonDot/data/moondot-remake.db`。
- Store MSIX 的 AppData 可能由系统重定向/虚拟化；包安装后的实际路径、旧桌面版数据导入与卸载行为须单独验证，不能把上述普通桌面版路径当作 Store 数据迁移保证。
- `MOONDOT_USER_DATA` 仅在未打包运行时覆盖数据目录，测试用它隔离数据。
- `.pnpm-store`、`.cache`、`node_modules`、`out`、`release` 都是可重建的本地内容。

数据库启用 WAL、外键、`synchronous=FULL` 和 5000ms busy timeout。新版数据库与旧的 `userData/data/moondot.db` 完全隔离，不迁移旧业务数据；旧库只用于一次性读取本机显示名与窗口状态。独立 schema v2 包含设置、项目及文件加入时间表，不含旧任务、模板和动态。启动时校验版本与 SQL 校验和，升级前生成在线快照并事务应用迁移。后续新版业务表变更必须追加编号迁移，不修改已应用的 SQL。

业务契约在 `src/shared/work.ts`，项目服务在 `src/main/services/work.ts`，文件服务在 `src/main/services/files.ts`，均受 trusted sender 与严格入参校验保护。业务数据使用参数化 SQLite SQL 与事务，设置服务沿用 Drizzle；不使用 `drizzle-kit push` 修改本地数据库。preload 只运行纯通道常量、IPC 转发及 Electron 文件路径桥接，不在运行时导入 Zod 或数据库依赖。

新增功能后执行 `pnpm.cmd check`，依次运行 lint、格式、Vitest、类型检查、构建及真实 Electron 测试。项目闭环测试使用独立临时数据库与文件目录，验证重启恢复，截图在 `test-results/`。迁移快照位于 `userData/snapshots/migrations/`，不是核心备份。旧库和新版库的迁移历史不同，不得交换文件或直接用新版迁移器处理旧库。

素材库和核心备份目录仍应在业务开发时由用户选择。开发环境初始化不会选定素材盘或备份盘。

## FFmpeg

Windows 安装命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-ffmpeg.ps1
pnpm.cmd run doctor
```

脚本安装 FFmpeg 9.0 LGPL shared 构建到 `resources/ffmpeg/win32-x64/`，校验 GitHub 资产摘要，保留 DLL、许可和 `source.json` 来源记录；不修改系统 PATH。详细要求及 macOS 布局见 [FFmpeg 说明](../resources/ffmpeg/README.md)。桌面壳目前尚未调用媒体工具。

## 本机验证记录

2026-11-05，第二阶段重做 Windows x64：37 项单元/集成测试、6 项 Electron 测试，以及 lint、格式、类型检查和生产构建通过。默认项目路径使用系统文档目录下的 `moondot`；测试通过 Electron 的系统目录配置重定向到临时文档目录，不创建真实用户项目。当前范围与验证边界见 [stage-2.md](stage-2.md)。以下记录为基础环境初始化时的历史结果。

2026-11-04，Windows x64：

- 固定锁文件的离线依赖安装成功，依赖 peer 检查无冲突。
- `pnpm run doctor`、严格类型检查、ESLint、Prettier 和生产构建通过。
- Electron 43.8.6 实际启动通过；渲染层通过白名单 IPC 连接主进程 SQLite，无法直接访问 Node API。
- 独立的中文/空格临时目录中，SQLite 持久化、事务回滚、WAL、完整性检查和 FTS5 trigram 验证通过。
- 实际开发模式通过：Vite 在 `http://127.0.0.1:5173/` 提供页面，Electron/preload/数据库连接正常；测试窗口已关闭。
- FFmpeg/ffprobe 9.0 分支 LGPL shared 构建的 SHA-256 与许可证检查通过；成功生成并读取 48 kHz、单声道、0.1 秒 PCM WAV，包含中文和空格的音频路径可用。
- `test-results/` 保存最近一次 Electron 启动截图；Vitest 已可启动，目前没有业务单元测试。

本记录不包含 macOS 实机、安装包、签名或业务功能验收。

## 跨平台 CI 验证记录

2026-11-06，[运行 42061216830](https://github.com/defixers/MoonDot/actions/runs/42061216830) 验证提交 `4c6b659`：Windows 通过，macOS 在三项集成测试的路径断言处失败，尚未进入编译及打包。原因是 macOS 临时目录的 `/var/...` 别名经 `realpath` 解析为 `/private/var/...`，测试却直接比较原始字符串。现已将相关断言改为比较真实路径，并统一项目 Electron 测试的临时根目录；增加目录别名用例在 Windows 上覆盖相同差异。修复的 macOS CI 结果仍需推送新提交后验证。

2026-11-05，[运行 41973439424](https://github.com/defixers/MoonDot/actions/runs/41973439424) 验证提交 `8528097`：Windows 与 macOS 15 arm64 均通过 lint、格式检查、12 项单元/集成测试、类型检查、生产构建、3 项 Electron 测试、未签名目录构建及测试截图上传。macOS 关闭最后一个窗口后保留进程、`activate` 重建窗口的行为已通过测试。

CI 使用 `electron-builder --dir`，尚未验证 MSIX/DMG/ZIP 安装流程、打包后应用启动、商店签名或最低系统版本。修复后需推送新提交触发 CI；GitHub 的重新运行操作仍使用原运行的提交，应核对运行页面的 commit SHA。

## Windows Store 构建

详见 [Microsoft Store / MSIX](microsoft-store.md)。`dist:win` 从环境读取 Partner Center 的 Identity Name、Publisher 和 Publisher Display Name，配置缺失会在编译前失败。普通目录构建与 CI 不需要这些字段。当前未配置 Partner Center，未生成正式 MSIX，也未提交商店。

Windows 默认打包目标改为 `dir`，Store 入口单独调用 `appx` 通道并指定 `.msix` 输出；原 NSIS 配置与未使用的 `electron-updater` 依赖已移除。商店应用由系统管理 AUMID 和更新；未来 Store 安装、更新、数据保留及核心备份流程须按新的发布约束验收。

## 开发边界和待办

- 第二阶段本地实现与验证以 [stage-2.md](stage-2.md) 为准；第一阶段 CI 成功记录不代表第二阶段已通过远程验证。
- Git `main` 分支已关联公开远程仓库 https://github.com/defixers/MoonDot；Windows 与 macOS 15 arm64 CI 均通过，状态见 [第一阶段记录](stage-1.md)。`.gitattributes` 统一文本检出为 LF，避免 Windows 的 `core.autocrlf` 导致格式检查差异。
- 为保留方案要求的 macOS 12 支持，固定使用 Electron 43（Electron 44 起要求 macOS 13）。macOS 15 arm64 CI 已验证基础运行行为；macOS 12 最低版本、安装与 Gatekeeper 流程及人工交互仍需实测，后续升级 Electron 前应重新评估最低系统版本。
- SignPath 申请未通过，停止接入。Partner Center 身份、MSIX 图标、商店资料/认证与完整发行许可材料列为发布待办；基础迁移已实现。
- 不配置账号、云端、遥测或自动上传。当前骨架未启用自动更新。
