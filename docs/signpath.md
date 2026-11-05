# SignPath 决策记录（已停止接入）

2026-11-05，用户反馈 SignPath 申请未获通过，原因涉及项目影响力要求。项目决定将 Windows 正式分发改为 **Microsoft Store + MSIX**。

SignPath 申请和证书接入不再作为阶段或发布门禁；原 NSIS / GitHub 自动更新方案由 Store 分发替代。macOS 仍通过 GitHub Releases 提供 unsigned arm64 DMG/ZIP，手动更新。

新的身份配置、构建、商店签名和验收要求见 [Microsoft Store / MSIX](microsoft-store.md)。Partner Center 尚未配置，不能将发布渠道决策视为商店认证或上架已完成。
