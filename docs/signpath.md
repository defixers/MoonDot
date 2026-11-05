# SignPath 申请准备

状态：**未申请、未提交**。2026-11-05 已确认公开 GitHub 仓库为 https://github.com/defixers/MoonDot；SignPath 尚未申请。本文是可用于后续申请的资料清单，不代表已经获得服务或证书。

## 可直接使用的项目说明

**项目名称**：月句 MoonDot  
**应用标识**：`com.moondot.app`  
**版权主体**：归尘回梦  
**许可证**：MIT  
**平台**：Windows 10/11 x64（签名目标）；macOS Apple Silicon 采用独立的未签名内测流程。  
**项目简介**：完全本地运行的音乐工程项目管理桌面应用，面向独立音乐人、制作人和录音棚，管理项目进度、音频版本、棚时排期、交付和预算。应用无账号、无业务云端、无遥测；业务数据保存在用户电脑。Windows 稳定版计划使用 NSIS 安装器，通过公开 GitHub Releases 分发。

## 仍需项目负责人提供

- 项目主页与维护者联系信息（公开仓库 URL 已确认）。
- SignPath 组织/账号归属和申请人的授权身份。
- 服务当前申请资格、开源计划适用性及服务方要求的其他资料；以 SignPath 官方申请要求为准。
- 获批后的 organization ID、project slug、signing policy slug、publisher identity 以及授权/审批流程。

## 获批后的实现位置

1. 在仓库 Secrets/受保护环境中配置凭据；不写入源码、安装包或应用设置。
2. 建立受保护的 Windows 签名工作流，上传构建制品并申请签名；普通 PR 检查仅具有 `contents: read` 权限。
3. 下载签名制品后验证 Authenticode、证书主体、时间戳以及制品哈希。
4. 稳定发布前再配置 `publisherName`、GitHub 更新通道及升级前核心备份；在验证完成之前不启用稳定通道自动更新。

本阶段不包含代填联系人、注册账号、接受服务条款或向 SignPath 发送申请。
