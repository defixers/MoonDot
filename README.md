# 月句 MoonDot

音乐工程项目管理系统（MoonDot Music Project Management System）——完全本地运行的单机桌面应用，面向独立音乐人、制作人和录音棚。

**当前阶段：第二阶段“项目与检索”本地实现；已加入项目、阶段模板、任务看板、备注、全局搜索和工作偏好。数据库自动升级至 schema v2，并保留升级前快照。Windows 发布继续使用 Microsoft Store + MSIX；Partner Center 尚未配置，商店认证与安装/升级实测待完成。**

当前交付、演示步骤和边界见 [第二阶段验收记录](docs/stage-2.md)；基础壳与历史验证见 [第一阶段记录](docs/stage-1.md)。

历史基础版本通过记录：[2026-11-05 CI · 提交 8528097](https://github.com/defixers/MoonDot/actions/runs/41973439424)。第二阶段代码仍需提交后触发双平台 CI，不能沿用该结论。

## 本地开发

使用 Node.js 24.21.0 与 pnpm 12.10.1，在项目根目录执行：

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

完整环境说明、FFmpeg 安装、检查与构建命令见 [开发环境文档](docs/development.md)。

## 交付物

- [开发方案 v1.8](<docs/音乐工程项目管理系统-开发方案.md>)：完全本地单机、1TB 素材库、用户自选核心备份目录、多币种/发票号预算、Windows Store/MSIX、macOS Apple Silicon、阶段进度。
- [Microsoft Store / MSIX](docs/microsoft-store.md)：Partner Center 身份配置、构建入口、商店签名/更新与发布验收。
- [工作台视觉预览](docs/ui/dashboard.png)：黑白灰蓝主色调、月句 MoonDot 品牌、本地模式、核心备份与完整素材未备份提示。
- [视觉稿 HTML 源文件](docs/ui/dashboard.html)：可直接用浏览器打开、修改。
- [MIT LICENSE](LICENSE)：© 2026 归尘回梦。
- [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)：第三方依赖与 FFmpeg LGPL 合规说明。

> 旧版本方案文档已按项目要求删除，仅保留当前 v1.8。

## 技术基线

- 客户端：Vue 3 + Vite + TypeScript + Pinia + Vue Router + Naive UI + Electron
- 后端：Electron 主进程内嵌应用服务，不启动 HTTP 服务
- 数据：SQLite（WAL）+ better-sqlite3 + Drizzle ORM；单进程访问
- 素材：本地 1TB 库；SHA-256 内容寻址（CAS）；FFmpeg 元数据/波形；自定义协议播放
- 预算：项目基准币种、费用原币/手动汇率/折算金额、发票号、待支付/已支付、超支预警
- 平台：Windows 10/11 x64；macOS 12+ Apple Silicon（arm64）
- 发布：Windows MSIX + Microsoft Store 签名/分发/更新；macOS 暂不签名/不公证、GitHub Releases 手动 DMG 更新
- 协议：MIT；FFmpeg 等第三方依赖单独遵守其许可证

## 品牌与版权

- 中文名：**月句**；英文名：**MoonDot**
- 标识：蓝色 `#2563EB` 圆角方块 + 白色“月”字 + “月句”字标，副标 `MOONDOT · MUSIC OPS`
- 应用标识：`com.moondot.app`；媒体协议：`moondot-media://`
- 版权主体：**归尘回梦**；项目协议：MIT

## 运行拓扑

```text
MoonDot Desktop（Vue 3 + Electron）
├─ Renderer ── 类型安全 IPC ──▶ Electron 主进程
├─ 主进程 ──▶ 本地 SQLite（WAL）
├─ 主进程 ──▶ 本地 1TB 素材库（CAS）
└─ 主进程 ──▶ 核心备份（用户选择目录）
                + 素材库同盘快照

无服务器 · 无云端 · 无账号 · 无多人协作 · 断网可用
```

## 备份现状

- **核心备份位置由用户选择**：首次启动/设置中通过目录选择器指定；应用不预设盘符、不静默使用其他目录。
- **核心备份内容**：数据库 + 已确认母带 + 文档 + 交付清单；容量、可写性、是否与素材库同盘都会校验。
- **同盘快照**：防误删/错误覆盖，不防磁盘损坏。
- **完整 1TB 素材备份**：已确认后续不补 2TB+ 外接盘，因此**不提供**；整盘故障时未进入核心备份的素材不可恢复。
- GitHub Releases 用于 macOS 发布包与发布说明；Windows 由 Store 分发。两者均不用于数据备份。

## 发布现状

- Windows：MSIX x64，经 Microsoft Store 认证后由商店重新签名、分发和更新；Partner Center 尚未配置。应用不使用 GitHub 自动更新器。侧载测试另需设备信任的签名。
- macOS：暂不配置 Developer ID/公证，unsigned arm64 内测；用户需右键打开；**不启用自动更新**，手动下载 DMG 覆盖安装。
- GitHub 仓库公开（MIT），应用内不保存 GitHub Token。

## 先读哪几节

1. `0. 方案摘要`：v1.8 的备份、预算与发布决策。
2. `2. 范围与优先级`：MVP 边界，避免做成 DAW/会计软件。
3. `4.4 音频资产与版本`、`4.8 费用与预算`：两个核心业务模块。
4. `6. 技术架构` 与 `7. 数据模型`：单机架构、CAS、IPC、多币种预算表结构。
5. `8.4 开发阶段与进度`、`8.7 验收标准`、`8.2 开源协议`：阶段门禁、验收与 MIT 合规。

## 下一步

1. 在首次启动向导中实现核心备份目录选择与校验（不预设盘符）。
2. 配置 Partner Center 包身份；完成 MSIX 品牌资源、商店认证、安装与升级验证。
3. 确认 macOS unsigned 内测的 Gatekeeper 手动打开说明，不配置公证。
4. 确认多币种支持清单（默认 CNY/USD/EUR/JPY/GBP/HKD）。
5. 用真实项目走查：单曲全流程、1TB 导入、多币种费用、交付。
