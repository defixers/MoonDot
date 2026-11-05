# Third-Party Notices

MoonDot（月句）© 2026 归尘回梦。项目代码采用 **MIT License**，完整文本见根目录 [LICENSE](LICENSE)。

本项目依赖的第三方组件仍归其各自作者所有，并遵守各自许可证。以下为运行时核心组件的代表性清单，发布前应以 `pnpm licenses list` 或合规扫描工具生成完整清单。

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| Electron | 桌面运行时 | MIT |
| Vue 3 | 前端框架 | MIT |
| Vite | 构建工具 | MIT |
| Naive UI | UI 组件 | MIT |
| @lucide/vue | 图标（原 lucide-vue-next 的后续包） | ISC |
| Inter / @fontsource-variable/inter | 本地打包的界面字体 | SIL Open Font License 1.1 |
| better-sqlite3 | SQLite 绑定 | MIT |
| Drizzle ORM | 数据访问 | Apache-2.0 |
| Zod | 运行时校验 | MIT |
| wavesurfer.js | 音频波形 | BSD-3-Clause |
| Apache ECharts | 图表 | Apache-2.0 |
| electron-updater | 自动更新 | MIT |
| electron-builder | 安装包构建 | MIT |
| FFmpeg / ffprobe | 音频元数据、波形、代理 | LGPL-2.1-or-later（以实际构建为准） |

## FFmpeg 说明

- MoonDot 使用 **LGPL** 配置构建的 FFmpeg/ffprobe，不使用 `--enable-gpl` 组件。
- 安装包随附 FFmpeg 的 LICENSE 文本与源码获取方式。
- FFmpeg 是独立可执行程序，不改变 MoonDot 项目代码的 MIT 许可。
- 如果替换为其他构建（例如包含 GPL 编码器），发布方必须重新评估并遵守相应许可证。

## 发布要求

1. 在安装包与“关于”页面保留 MIT 版权与许可声明。
2. 随包提供 `THIRD_PARTY_NOTICES.md` 与 FFmpeg LICENSE。
3. 发布前运行许可证扫描，确认没有不兼容许可证。
4. 不得删除第三方组件中的版权声明与许可证文本。
