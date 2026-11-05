# 第一阶段：基础与设计

更新日期：2026-11-05。实现基线为开发方案 v1.7。本阶段本地实现可演示，Windows 与 macOS 15 arm64 CI 已全部通过；**阶段门禁尚未全部通过**，SignPath 申请仍阻塞，最低系统版本与安装包实测尚未完成。

## 范围与执行基线

- 完全本地、单用户；Vue → 受限 preload → Electron 主进程 → SQLite，不引入 HTTP 业务后端、账号、云端或遥测。
- 本阶段提供工作台空状态、设置、关于与许可；显示名是验证主进程数据库读写的最小持久化功能，不代表第二阶段项目/任务功能已完成。
- 视觉沿用 v1.7 的黑白灰蓝方案：232px 深色侧栏、60px 顶栏、`#2563EB` 主色、24px 标题、8/12px 圆角。Inter 字体本地打包，中文使用系统字体回退；Lucide 线性图标、键盘焦点、窄视口折叠导航与减弱动态效果已接入。
- 采用现有“月”字标作为本阶段实现基线，最终品牌确认仍沿用原方案的待确认项。
- 素材目录与核心备份目录不自动选择；本阶段只创建应用数据和数据库迁移快照目录。音频导入、项目任务、预算及核心备份业务继续按后续阶段开发。

## 交付与验收

| 项目               | 验证结果                | 验收说明                                                                                                              |
| ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 需求与视觉基线     | 已落实                  | 本文、原 v1.7、CSS tokens、离线字体与三页基础界面                                                                     |
| GitHub 仓库        | 已配置                  | 公开仓库 https://github.com/defixers/MoonDot；本地 `main` 跟踪 `origin/main`                                          |
| CI                 | 两个平台全部通过        | 提交 `8528097`；Windows 与 macOS 15 arm64 的检查、测试、未签名目录构建和测试截图上传成功                              |
| Electron 壳        | Windows/macOS CI 已验证 | 启动、设置持久化、窗口恢复、缩放、单实例与 IPC；macOS 关闭窗口不退出、activate 重建窗口通过测试；原生菜单仍需人工走查 |
| SQLite / 迁移      | 已验证                  | WAL、外键、FULL、busy timeout；schema v1、版本记录、SQL 校验和、升级前在线快照、失败事务回滚、拒绝降级                |
| IPC                | 已验证                  | 白名单 API、主窗口/主 frame/文档 URL 校验、Zod 入参、统一结果、错误信息脱敏                                           |
| 路径               | 已验证                  | 正式/开发/测试数据隔离；中文与空格路径；目录穿越、绝对路径、Windows ADS 和符号链接逃逸防护                            |
| 许可               | 基础文件齐备            | MIT、第三方代表清单、Inter OFL 全文进入关于页与构建配置；完整发行依赖清单仍需发布阶段生成                             |
| Apple Silicon 启动 | macOS 15 arm64 CI 通过  | 启动/SQLite、单实例/IPC、窗口关闭与 activate 重建测试通过；macOS 12 最低版本与打包后启动仍待实测                      |
| SignPath 申请      | 阻塞                    | 用户确认尚未配置；申请准备材料见 [signpath.md](signpath.md)                                                           |

## 演示步骤

1. `pnpm dev` 打开工作台，确认本地数据库连接成功。
2. 打开“设置”，输入显示名并保存；回到工作台查看问候语。
3. 调整窗口大小，退出并重新启动；确认显示名和窗口状态保留。
4. 应用运行时再次启动，确认仅保留一个实例并唤醒已有窗口。
5. 打开“关于与许可”，查看 MIT、第三方说明和 Inter OFL 全文。
6. 执行 `pnpm check`，运行格式、静态检查、12 项单元/集成测试和 3 项真实 Electron 测试。测试截图写入 `test-results/`。

## 本次验证记录

- 2026-11-05，[CI 运行 41973439424](https://github.com/defixers/MoonDot/actions/runs/41973439424) 对提交 `8528097` 的 Windows 与 macOS 15 arm64 任务均返回 `success`。每个平台均通过 12 项单元/集成测试、3 项 Electron 测试、静态检查、编译、未签名目录构建和测试截图上传。
- macOS `/var` 符号链接路径、CI 小工作区窗口恢复、等待 `closed` 后验证 `activate` 重建的修复均已通过远程复验；此前测试截图上传超时在本次运行中未再出现。
- Windows x64：`pnpm.cmd check` 全部通过，包含 ESLint、Prettier、严格类型检查、构建、12 项单元/集成测试和 3 项 Electron 测试；键盘跳转与 200% 缩放已验证。
- Windows 未签名应用目录构建成功，产物为 `release/win-unpacked/月句 MoonDot.exe`。构建复用本地 Electron，命令如下：

  ```powershell
  $env:ELECTRON_BUILDER_CACHE="$PWD/.cache/electron-builder"
  $env:CSC_IDENTITY_AUTO_DISCOVERY='false'
  pnpm.cmd exec electron-builder --dir --win --x64 --publish never --config.electronDist=node_modules/electron/dist
  ```

- 已检查 `app.asar` 内的 main/preload/renderer、内嵌数据库迁移、MIT、第三方说明、Inter OFL 和离线字体资源。
- 本次未启动打包后的应用；运行验证使用构建代码与 Electron 测试环境。目录构建不代表安装器、签名、更新发布或最低系统版本验收通过。
- CI 分别执行 lint、格式、单元测试、编译和 Electron 测试，并启用 Playwright GitHub 错误注解、留档测试截图。工作流没有发布权限或签名密钥。

## 数据库与迁移约定

- `app_settings`：JSON 设置值、UTC 更新时间。目前只允许通过业务 API 读写 `profile`；窗口状态仅由主进程读写。
- `_moondot_migrations`：已应用版本、名称、SQL SHA-256、UTC 应用时间；`PRAGMA user_version` 同步记录 schema 版本。
- Drizzle schema 在 `src/main/db/schema.ts`；编号 SQL 迁移以 TypeScript 模块内嵌字符串放在 `src/main/db/migrations/`，直接编译进 main bundle，因此打包后不依赖源码目录。
- 已应用迁移不得修改，变更需新增连续编号并更新迁移列表。SQL 历史不匹配、未知无版本数据库或数据库比程序新时，拒绝自动修改。
- 升级前使用 SQLite 在线 backup API 生成独立快照，包含已提交 WAL 内容。快照成功后，所有待应用迁移与版本记录在一个事务中执行。
- 快照位置：`userData/snapshots/migrations/`。这是**同盘迁移快照，不是用户核心备份**，不防磁盘故障；当前不自动删除快照。
- 开发恢复操作：退出应用，保留当前数据库及 WAL/SHM 文件副本，再在独立目录使用快照和匹配 schema 的程序验证；不得在运行中的数据库上直接覆盖快照。自动恢复向导属于后续阶段。
- 快照恢复、快照失败阻止迁移、SQL 失败回滚、历史篡改拒绝、禁止降级均有自动化覆盖。

## 当前已知问题与门禁

- Windows 最低系统版本、macOS 12 最低系统版本、打包后应用启动、安装流程、Gatekeeper 和原生菜单人工走查仍需实测；macOS 15 arm64 CI 的通过范围见上文。Electron 43 保留 macOS 12 支持；升级 44+ 前需重新评估最低版本。
- SignPath 尚未申请，未签名安装器与更新发布不属于当前通过项；稳定版发布仍受签名门禁控制。
- 应用图标、完整第三方发行清单、日志导出、日志保留策略、备份/恢复向导及业务模块尚未完成。当前日志为本地 10MB 滚动文件，不上传。
- 核心备份未配置、完整素材备份不提供的状态持续显示，不将迁移快照冒充核心备份成功。

本阶段不按日期或工时宣告完成。上述外部门禁关闭前，保持“本地实现完成、阶段验收待补齐”，不宣称第一阶段 100%。
