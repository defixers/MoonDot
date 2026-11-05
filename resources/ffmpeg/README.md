# FFmpeg 开发依赖

Windows x64：在项目根目录运行 `powershell -ExecutionPolicy Bypass -File scripts/setup-ffmpeg.ps1`。
脚本下载 BtbN 的 FFmpeg 9.0 LGPL shared 构建，校验 GitHub 资产 SHA-256，保留二进制、DLL、许可、文档和来源记录。
安装位置为 `win32-x64/bin/ffmpeg.exe` 和 `win32-x64/bin/ffprobe.exe`，不修改系统 PATH。

macOS arm64：将经核验的 LGPL 构建及所需动态库、许可证和源码获取说明放入 `darwin-arm64/`，可执行文件位于 `bin/`。不得直接用默认含 GPL 的 Homebrew FFmpeg 替代。

运行 `pnpm run doctor` 检查版本和 LGPL 构建标志。二进制忽略入库；开发壳尚未使用或打包媒体工具。实现媒体功能时需配置 electron-builder 的 `extraResources`，并补齐发布所需的对应源码、构建配置和第三方许可。本地开发下载不代表已经完成发行合规验收。
