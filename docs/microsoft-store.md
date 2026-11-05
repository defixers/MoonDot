# Windows：Microsoft Store 与 MSIX

更新日期：2026-11-05。SignPath 申请未通过，Windows 正式分发改为 Microsoft Store，包格式为 MSIX、架构为 x64。**Partner Center 尚未配置，尚无正式包身份、商店认证或上架结果。**

## 分发与更新

- Windows：将 MSIX 提交 Partner Center，商店认证通过后由 Microsoft Store 重新签名并分发。MSIX/AppX 商店提交无需购买 CA 代码签名证书；这不适用于向商店提交 MSI/EXE 安装器。
- Windows 更新由 Microsoft Store 和系统策略管理。应用不使用 `electron-updater`，不请求 GitHub 更新源，不生成 `latest.yml` 或 blockmap，也不提供无法控制 Store 行为的“关闭自动更新”开关。
- 应用业务仍完全本地且可离线运行；商店的下载、认证、更新和网络行为独立于应用，不能承诺关闭应用内某个开关就能停止系统商店联网。
- MSIX 侧载测试需要测试设备信任的签名；未签名提交包不能直接视为可双击安装的发布包。不自动创建证书或修改系统信任。
- GitHub 保留公开 MIT 源码与 macOS unsigned arm64 DMG/ZIP 发布；macOS 手动更新。Windows 商店上架后，下载说明链接到商店产品页。

## Partner Center 配置

负责人需注册并验证开发者账号、预留应用名称、创建 MSIX 产品。费用与资格以账号所在地区的 Partner Center 当前规则为准。随后在产品的身份页面复制下列值，大小写、空格和标点必须完全一致：

| 环境变量                               | Partner Center 字段                     |
| -------------------------------------- | --------------------------------------- |
| `MOONDOT_STORE_IDENTITY_NAME`          | Package/Identity/Name                   |
| `MOONDOT_STORE_PUBLISHER`              | Package/Identity/Publisher，完整 `CN=…` |
| `MOONDOT_STORE_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |

这些是包身份信息，不是签名密钥。Electron 的 `appId=com.moondot.app` 不等于 Store Identity Name，也不能替代它。`Application.Id` 固定为 `MoonDot`；商店应用的 AUMID 由系统按包身份生成，应用在 Store 运行模式下不覆盖它。包身份与发布者确定后应保持稳定，以免升级被识别为另一个应用。

## 当前构建入口

设置上述三个环境变量后，在 Windows x64 项目根目录执行：

```powershell
pnpm.cmd run msix:check
pnpm.cmd dist:win
```

`msix:check` 只校验本地配置，不联网核验账户归属，也不生成包；缺失或格式错误时失败，不自动填充虚构的商店身份。配置检查通过不代表可以上架。

`dist:win` 先检查身份，再编译应用，由 `scripts/build-msix.mjs` 调用 electron-builder 的 `appx` 打包通道，将 `.msix` 输出路径直接传给 MakeAppx。没有把 NSIS/EXE 文件改名为 MSIX，也没有使用当前工具不支持的 `msix` target。输出位置为 `release/msix/MoonDot-<四段版本>-x64.msix`。仅构建、不签名、不上传；签名自动发现关闭。

版本来自 `package.json` 的前三个数字分量，每段不超过 65535；第四段固定为 `0`，不使用 CI run number。预发布后缀不进入 MSIX 版本，例如 `0.1.0-dev.0` 对应 `0.1.0.0`；连续提交必须递增前三段之一，不能只改预发布后缀。最低系统版本声明为 Windows 10 22H2 (`10.0.19045.0`)，最低版本兼容性仍需实测。

普通 `pnpm run pack` 与当前 CI 仍生成应用目录，且无需商店身份。它们不等同于 MSIX 验证；当前 CI 通过记录仅覆盖目录构建。Store 配置采用最小必要的 `runFullTrust` 能力，不启用自启动或额外权限。

当前未生成正式 MSIX：缺少 Partner Center 身份，品牌图标、认证材料与包安装测试也尚未完成。electron-builder 会回退到示例包图标；正式提交前必须在默认构建资源目录 `build/appx/` 提供 `StoreLogo.png`、`Square44x44Logo.png`、`Square150x150Logo.png`（以及需要时的 `Wide310x150Logo.png`），并配置应用图标、准备商店截图。不能将示例图标包作为发行验收结果。

本轮已通过 5 项身份/配置检查测试、electron-builder 配置 schema 校验，以及 Windows 本地完整 `pnpm check`（17 项单元/集成测试、3 项 Electron 测试）。这些检查未调用商店服务，不能证明真实包可安装或通过商店认证。

## 数据与升级约束

- 安装目录由系统管理且不可写。SQLite、日志、迁移快照写入 Electron `userData`；MSIX 下 AppData 可能发生重定向/虚拟化，实际落点须在已安装包内核对。普通桌面版 `%APPDATA%/MoonDot` 的位置不保证等同于 Store 版。
- 首次迁入 Store 包必须设计并测试旧数据导入，不能假定包身份或文件虚拟化会自动迁移旧数据库。
- 用户素材与核心备份目录继续由用户选择，放在包管理目录之外；不能依赖卸载后保留包内或包私有应用数据。
- Store 可以在应用未运行时更新包，因此不能承诺在每次商店下载/安装前由应用强制备份。新版本首次打开数据库前执行已有迁移快照与事务回滚；用户核心备份与恢复仍按后续阶段实现。
- 故障恢复优先发布版本号更高的修复包，或在匹配 schema 的程序中恢复备份；不承诺商店支持任意降级安装。更新前后均需验证 SQLite、原生模块、用户目录权限与未来 FFmpeg 子进程。

## 阶段门禁与发布验收

阶段 1 的原 SignPath 申请门禁由“Store/MSIX 路径确认、身份配置清单与构建入口”替代，不再等待 SignPath 重新申请。Partner Center 未配置及 MSIX 实测列为发布依赖，商店上架与认证放在阶段 6；第一阶段其余门禁仍按验收记录执行。

发布前必须补齐：

1. Partner Center 身份匹配、开发者验证、产品页、隐私声明、支持联系方式、年龄分级和所需地区信息。
2. 说明 `runFullTrust` 用途：Electron 桌面进程、本地 SQLite、用户授权目录及后续音频处理；提交商店要求的受限能力说明并通过审核。
3. 正式品牌资源、依赖许可、FFmpeg LGPL 发行材料，以及 Windows App Certification Kit 检查。
4. 测试签名或商店测试分发安装、首次启动、单实例、设置/窗口恢复、文件对话框、SQLite 和用户目录访问。
5. 从上一 MSIX 版本升级，验证数据保留、迁移失败恢复、旧桌面版数据导入与卸载前备份提示。
6. Windows 10 22H2 / Windows 11 的实际兼容性及 Store 签名、下载、安装和更新路径；当前产品功能达到可提交审核的完整度。

本轮不注册账号、不提交应用、不接受服务条款、不安装证书、不上传 MSIX。

## 参考资料

- [Microsoft Store 的 MSIX 包与签名要求](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [MSIX 打包、测试与分发](https://learn.microsoft.com/en-us/windows/msix/package/packaging-uwp-apps)
- [electron-builder AppX 配置](https://www.electron.build/appx.html)
