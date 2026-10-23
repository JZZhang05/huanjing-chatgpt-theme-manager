# 开发与发布

## 目录

| 路径 | 用途 |
| --- | --- |
| src/ | 本机助手、界面样式、主题菜单、Steam 导入与处理 |
| assets/ | 生成插画、图标和项目横幅 |
| defaults/ | 公开发行版的出厂设置 |
| installer/Setup.cs | .NET Framework Windows 安装器 |
| scripts/ | 依赖准备、构建、验证 |
| tests/ | 缓存、链接解析、透明窗口范围与配色回归测试 |
| .github/workflows/ | 自动检查与安装包构建 |

## 本地验证

需要 Node.js 24+、Python 3.13+。

    npm test
    python scripts/validate_source.py

不需要 npm install。测试不连接 ChatGPT、不修改用户主题。
Windows 检查还会解析 PowerShell 5.1 脚本，避免中文编码或语法回归。

## 构建 Windows 安装包

Windows x64 自带的 .NET Framework 4.8 编译器需可用。

    python scripts/build.py
    python scripts/verify_package.py

依赖锁在 scripts/dependencies.lock.json。构建下载固定版本的 Node.js、Python embeddable 和三个 Python wheel，逐个核对 SHA-256，缓存于 .cache/。
源码仓库不提交这些二进制。已有缓存时可使用：

    python scripts/build.py --offline

输出 dist/Huanjing-Setup-版本.exe、SHA256SUMS.txt、说明与许可。
验证脚本在 build/verify 中文 path/ 内测试新安装、文件哈希、独立解释器、主题载荷和保留用户配置的升级；不创建启动项、注册表卸载项，也不启动 ChatGPT。

可选真实视频转换检查（编码器由你单独下载）：

    python scripts/verify_package.py --ffmpeg D:\Tools\ffmpeg.exe

FFmpeg 不进入安装包。使用者首次新导入时单独下载固定版本并校验，具体地址和来源见 scripts/ffmpeg-download.json。

## 实现边界

LaunchChatGPT.cs 查找官方 MSIX 包并核对进程、仅监听本机的调试端口及独立主题助手身份。
runtime.mjs 将样式和可交互菜单注入已验证的应用页面，排除宠物透明浮窗与独立辅助窗口，不操作聊天内容。

主题状态按壁纸保存。旧品牌的内部 product/注册表标识保留为 EmiliaTheme，以便兼容已有安装；用户看到的名称为幻景。
旧版本目录中存在的内置动态壁纸会自动保留并显示；公开版不会显示并不存在的旧壁纸。

媒体 base64 缓存采用 LRU，最多保留 64 MiB。单个超大文件可以播放但不进入缓存；此上限不代表应用总内存上限。
浏览器切走壁纸后撤销旧 Blob URL，丢弃已过时的异步资源响应。主题验证摘要变化时立即写盘，未变化时约每五秒刷新一次；启动助手状态未变时约每十秒写盘一次。

## 发布

1. 修改 config.json 与 package.json 中的版本，并更新使用说明、CHANGELOG 和对应版本说明。
2. 运行源代码检查、Windows 构建与安装包验收。
3. 提交并推送代码。GitHub Actions 会自动执行同类检查。
4. 使用 GitHub CLI 创建带版本标签的 Release，上传安装器、校验文件和许可说明。

    gh release create v1.1.0 dist/* --title "幻景 1.1.0" --notes-file docs/releases/v1.1.0.md

也可手动运行仓库的 Windows installer 工作流获取已验证的构建产物，再创建 Release。
不要上传 build/、.cache/、用户安装目录、诊断日志、个人配色或工坊媒体。签名证书不存入仓库。
