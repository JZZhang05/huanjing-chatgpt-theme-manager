# 幻景 · ChatGPT 主题管理器

为官方 ChatGPT Windows 客户端添加壁纸、动态背景和随壁纸调整的界面配色。

[下载安装包](https://github.com/JZZhang05/huanjing-chatgpt-theme-manager/releases/latest) · [使用说明](docs/usage.md) · [常见问题](docs/troubleshooting.md) · [更新记录](CHANGELOG.md)

<img src="assets/banner.svg" alt="幻景：壁纸、配色、透明度，融入你的 ChatGPT" width="880">

## 能做什么

- 在 ChatGPT 右下角打开「幻景」，切换壁纸、恢复系统原生外观。
- 粘贴 Wallpaper Engine 的 Steam 创意工坊链接，导入视频、场景或网页壁纸。
- 根据壁纸生成推荐配色，单独调整主色、强调色、文字颜色、面板透明度、背景遮罩和模糊。
- 每张壁纸单独记住设置；删除列表项后可以撤销或恢复。
- 发送按钮、设置卡片、开关、个人中心和 Token 活动色阶跟随主题。
- 随官方应用启动连接，更新后重新寻找安装位置；虚拟宠物透明窗口保留原生显示。

## 安装

1. 安装并登录[新版官方 ChatGPT Windows 客户端](https://learn.chatgpt.com/docs/windows/windows-app)。
2. 从 [Releases](https://github.com/JZZhang05/huanjing-chatgpt-theme-manager/releases) 下载 Huanjing-Setup-1.1.0.exe，选择独立安装目录，例如 D:\Huanjing。
3. 安装后在 ChatGPT 右下角打开「◈ 幻景」。首次接入可能需要正常重开应用，请先完成正在进行的操作。

支持 Windows 10/11 x64、.NET Framework 4.8。安装包自带 Node.js 和 Python，无需另行配置。
导入新壁纸需要 Steam、Wallpaper Engine 和作品访问权限；首次转换会下载并校验编码工具。

已在官方客户端 **26.1016.8622.0** 验证。其内部包名为 OpenAI.Codex_2p2nqsd0c76g0，程序入口为 ChatGPT.exe。
旧版独立 ChatGPT、网页、macOS、Linux、手机和 ARM64 未适配。官方更新改变界面或连接方式时，可能需要更新本工具。

## 公开版素材

公开版包含一张制作过程中生成的爱蜜莉雅静态插画。Steam 壁纸由使用者自行订阅并导入；仓库和公开安装包不附带第三方工坊视频。
已有用户升级后会保留本机壁纸与个人调色。[素材与链接说明](docs/wallpapers.md)

## 开发与构建

仓库只包含源码、默认设置和自有插画，不提交运行状态、账号、聊天、导入媒体或依赖二进制。

    npm test
    python scripts/validate_source.py
    python scripts/build.py
    python scripts/verify_package.py

安装包构建需要 Windows x64、Python 3.13+、Node.js 24+ 和 .NET Framework 4.8 的编译器。
构建脚本从官方站点下载固定版本依赖并核对 SHA-256；结果位于 dist/。
具体目录、验证方式和发布流程见[开发说明](docs/development.md)。

## 连接方式与隐私

这是社区自制工具，与 OpenAI 和 Wallpaper Engine 没有隶属关系。它通过仅监听本机的调试连接注入界面样式，不改写官方客户端安装文件。
该连接能访问已登录应用，本机其他进程也可能连接该端口；请阅读[安全说明](SECURITY.md)。
主题管理器不采集或上传聊天内容；联网导入、依赖下载和本地记录见[隐私说明](PRIVACY.md)。

## 许可

管理器自有代码采用 [MIT License](LICENSE)。第三方依赖保留各自许可，插画和工坊作品的权利另见[素材说明](docs/wallpapers.md)与 [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)。
