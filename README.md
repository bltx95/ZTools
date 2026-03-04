# ZTools

<div align="center">

<img src="./.github/assets/icon.png" alt="ZTools Logo" width="120">

**一个高性能、可扩展的应用启动器和插件平台**

_uTools 的开源实现 | 支持 macOS 和 Windows_

[![GitHub release](https://img.shields.io/github/v/release/lzx8589561/ZTools)](https://github.com/ZToolsCenter/ZTools/releases)
[![License](https://img.shields.io/github/license/lzx8589561/ZTools)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)](https://github.com/ZToolsCenter/ZTools)

[English](./README_EN.md) | 简体中文

</div>

---

## ✨ 特性

- 🚀 **快速启动** - 拼音搜索、正则匹配、历史记录、固定应用
- 🧩 **插件系统** - 支持 UI 插件和无界面插件，完整的 API 支持
- 📋 **剪贴板管理** - 历史记录、搜索、图片支持、跨平台原生实现
- 🎨 **主题定制** - 系统/亮色/暗色模式，6 种主题色可选
- ⚡ **高性能** - LMDB 数据库、WebContentsView 架构、极速响应
- 🌍 **跨平台** - 原生支持 macOS 和 Windows，统一体验
- 🔒 **数据隔离** - 插件数据独立存储，安全可靠
- 🛠️ **开发友好** - 完整的 TypeScript 类型支持，热重载开发
- ⚙️ **最新技术栈** - Electron 38.5 + Node 22.20 + Chrome 140

## 📸 预览

<div align="center">
  <img src="./.github/assets/demo.gif" alt="ZTools 演示" width="600">
  <p><i>快速启动应用和搜索功能演示</i></p>
</div>

### 界面展示

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <img src="./.github/assets/main-light.png" alt="主界面 - 亮色主题">
        <p align="center"><i>主界面 - 亮色主题</i></p>
      </td>
      <td width="50%">
        <img src="./.github/assets/main-dark.png" alt="主界面 - 暗色主题">
        <p align="center"><i>主界面 - 暗色主题</i></p>
      </td>
    </tr>
    <tr>
      <td width="50%">
        <img src="./.github/assets/settings.png" alt="设置界面">
        <p align="center"><i>设置界面 - 主题定制和通用设置</i></p>
      </td>
      <td width="50%">
        <img src="./.github/assets/plugin-market.png" alt="插件市场">
        <p align="center"><i>插件市场 - 在线安装和管理插件</i></p>
      </td>
    </tr>
  </table>
</div>

## 🚀 快速开始

### 安装

#### 方式 1：下载预编译版本（推荐）

从 [Releases](https://github.com/ZToolsCenter/ZTools/releases) 页面下载最新版本：

- **macOS**: `ztools-x.x.x.dmg` 或 `ZTools-x.x.x-arm64-mac.zip`
- **Windows**: `ztools-x.x.x-setup.exe` 或 `ztools-x.x.x-win.zip`

#### 方式 2：从源码构建

```bash
# 克隆仓库
git clone https://github.com/ZToolsCenter/ZTools.git
cd ZTools

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build:mac    # macOS
pnpm build:win    # Windows
```

### 使用

1. 启动应用后，使用快捷键 `Option+Z`（macOS）或 `Alt+Z`（Windows）唤起主界面
2. 输入应用名称或命令进行搜索
3. 按 `↑` `↓` `←` `→` 选择，`Enter` 确认，`Esc` 退出

### 插件市场

ZTools 提供内置的插件市场，可以方便地浏览和安装插件：

**主要功能**：

- 📦 **在线安装** - 一键下载安装插件
- 🔄 **插件升级** - 检测插件更新，一键升级到最新版本
- 🔍 **插件详情** - 查看插件描述、版本、作者等详细信息
- ✅ **已装管理** - 已安装插件可直接打开或升级

**使用方法**：

1. 打开 ZTools 设置（点击头像）
2. 切换到"插件市场"标签
3. 浏览并安装感兴趣的插件
4. 已安装插件会显示"打开"或"升级"按钮

**技术实现**：

- 插件托管在 GitHub Releases（[ZTools-plugins](https://github.com/ZToolsCenter/ZTools-plugins/releases)）
- 插件列表：从 `plugins.json` 文件获取插件信息和下载链接
- 插件包格式：ZIP 压缩包，包含 `plugin.json` 和插件文件
- 版本比较：自动对比本地版本和市场版本（语义化版本号）
- 升级策略：先卸载旧版本，再安装新版本

### 应用内更新

ZTools 支持应用内一键更新，无需手动下载安装包：

**更新流程**：

1. 应用自动检查更新（启动时或手动检查）
2. 发现新版本时显示更新提示
3. 点击更新按钮开始下载更新包
4. 下载完成后自动安装并重启应用

**技术实现**：

- 更新源：GitHub Releases（[ZTools](https://github.com/ZToolsCenter/ZTools/releases)）
- 更新信息文件：`latest.yml`（包含版本号、更新日志等）
- 更新包格式：ZIP 压缩包，命名格式为 `update-{platform}-{arch}-{version}.zip`
  - 示例：`update-darwin-arm64-1.2.8.zip`（macOS Apple Silicon）
  - 示例：`update-win32-x64-1.2.8.zip`（Windows x64）
- 更新程序：独立的 `ztools-updater` 可执行文件
  - macOS: `ztools-updater`（位于 Contents/MacOS/）
  - Windows: `ztools-agent.exe`（位于应用根目录）
- 更新流程：
  1. 从 GitHub Releases 下载 `latest.yml` 获取最新版本信息
  2. 下载对应平台的更新包
  3. 解压并启动独立的 updater 程序
  4. 应用退出
  5. updater 替换 `app.asar` 文件
  6. 自动重启应用

**平台支持**：

- ✅ macOS (Apple Silicon)
- ✅ Windows (x64)

## 🧩 插件开发

ZTools 是一个强大、可扩展的插件平台，使用自定义插件提升您的生产力。通过简单的配置、丰富的 API 以及跨平台支持，您可以轻松开发出功能强大的插件。

**插件系统特点**：

- 📝 **简单配置** - 通过标准的 `plugin.json` 文件轻松定义插件，无需复杂的设置
- 🔌 **丰富的 API** - 通过全局 `ztools` 对象访问系统能力，包括通知、模拟输入和持久化存储
- 🎯 **灵活的指令** - 使用文本、正则或全局钩子触发您的插件，以适应任何工作流
- 🌍 **跨平台** - 一次构建，在 Windows、macOS 和 Linux 上运行，在所有设备上获得一致的体验

> 📖 **完整文档**：查看 [ZTools 开发者文档](https://ztoolscenter.github.io/ZTools-doc/) 了解更多详情

ZTools 提供完整的插件系统，支持两种类型：

### UI 插件

```json
// plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "我的插件",
  "main": "index.html",
  "logo": "logo.png",
  "features": [
    {
      "code": "search",
      "explain": "搜索功能",
      "cmds": ["搜索"]
    }
  ]
}
```

### 无界面插件

无界面插件适合后台任务、数据处理等不需要 UI 的场景。

```json
// plugin.json（注意：没有 main 字段）
{
  "name": "my-headless-plugin",
  "version": "1.0.0",
  "description": "后台处理插件",
  "logo": "logo.png",
  "features": [
    {
      "code": "process",
      "explain": "后台处理",
      "cmds": ["处理"]
    }
  ]
}
```

```javascript
// preload.js
window.exports = {
  process: {
    mode: 'none', // 无界面插件标识
    args: {
      enter: async (action) => {
        // 处理逻辑
        window.ztools.showNotification('执行完成')
        return { success: true }
      }
    }
  }
}
```

### 插件 API

ZTools 提供丰富的 API：

- **数据库 API** - 持久化数据存储
- **剪贴板 API** - 访问和监听剪贴板
- **UI API** - 控制窗口和界面
- **对话框 API** - 显示对话框和文件选择器
- **Shell API** - 执行命令行命令
- **窗口管理 API** - 创建独立窗口

详细文档请查看 [CLAUDE.md](./CLAUDE.md)

## 🛠️ 技术栈

- **框架**: Electron 38 + Vue 3 + TypeScript
- **构建**: Vite + electron-vite
- **数据库**: LMDB（高性能键值存储）
- **状态管理**: Pinia
- **搜索引擎**: Fuse.js（拼音支持）
- **原生模块**: C++ (Node-API)
  - 剪贴板监听
  - 窗口管理
  - 区域截图（Windows）

## 📁 项目结构

```
ztools/
├── src/
│   ├── main/              # 主进程
│   │   ├── api/          # IPC API 模块
│   │   ├── core/         # 核心功能（数据库、原生模块）
│   │   ├── windowManager.ts
│   │   └── pluginManager.ts
│   ├── preload/          # Preload 脚本
│   └── renderer/         # 渲染进程（Vue）
│       ├── components/
│       ├── stores/       # Pinia 状态管理
│       └── App.vue
├── resources/            # 资源文件
│   ├── lib/             # 原生模块（.node）
│   └── preload.js       # 插件 Preload
└── CLAUDE.md            # 完整技术文档
```

## 📚 文档

- [CLAUDE.md](./CLAUDE.md) - 完整技术文档和架构说明
- [开发命令](#开发命令) - 常用命令说明
- [插件开发](#插件开发) - 插件开发指南

## 💻 开发

### 环境要求

- Node.js >= 18
- npm >= 9
- macOS 或 Windows 开发环境

### 代码拉取

1. 先 fork 仓库
  - 如果需要贡献代码请 fork [ztools-api-types](https://github.com/ZToolsCenter/ztools-api-types) 和 [ztools-plugin-cli](https://github.com/ZToolsCenter/ztools-plugin-cli) 仓库
2. 拉取完整代码

```bash
git clone https://github.com/ZToolsCenter/ZTools.git --recurse-submodules
```
3. 提 Pull requests

### 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev

# 类型检查
pnpm typecheck          # 全部
pnpm typecheck:node     # 主进程 + preload
pnpm typecheck:web      # 渲染进程

# 代码格式化
pnpm format             # Prettier 格式化
pnpm lint               # ESLint 检查

# 构建
pnpm build              # 仅编译源码
pnpm build:mac          # 打包 macOS 应用
pnpm build:win          # 打包 Windows 应用
pnpm build:unpack       # 打包但不生成安装包（调试用）
```

### 调试

- 主进程：在 VS Code 中按 F5，或使用 `pnpm dev` 查看终端日志
- 渲染进程：在应用中按 `Cmd+Option+I`（macOS）或 `Ctrl+Shift+I`（Windows）打开开发者工具
- 插件：在插件页面点击"打开开发者工具"按钮

## 🗺️ 路线图

### 已完成 ✅

- [x] 应用快速启动和搜索
- [x] 插件系统（UI + 无界面）
- [x] 剪贴板历史管理
- [x] 跨平台支持（macOS + Windows）
- [x] LMDB 数据库迁移
- [x] 主题定制
- [x] 数据隔离
- [x] 插件市场
- [x] 全局快捷键自定义
- [x] 插件分离为独立窗口
- [ ] 插件自动更新
- [ ] 云同步（可选）
- [ ] Linux 支持
- [ ] MCP工具集

## 🐛 问题反馈

遇到问题？请在 [Issues](https://github.com/ZToolsCenter/ZTools/issues) 中反馈。

提交 Issue 时请包含：

- 操作系统版本
- ZTools 版本
- 复现步骤
- 错误日志（如有）

## 📄 许可证

本项目采用 [MIT License](./LICENSE) 许可证。

## 💖 赞助支持

如果 ZTools 对你有帮助，欢迎通过爱发电赞助支持项目的持续开发：

<a href="https://afdian.com/a/ZTools">
  <img src="https://img.shields.io/badge/爱发电-赞助支持-946ce6?style=for-the-badge" alt="爱发电">
</a>

## 💝 致谢

- [uTools](https://u.tools/) - 灵感来源
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [LMDB](http://www.lmdb.tech/) - 高性能嵌入式数据库

## ⭐ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=lzx8589561/ZTools&type=Date)](https://star-history.com/#lzx8589561/ZTools&Date)

---

<div align="center">

**如果这个项目对你有帮助，请给个 Star ⭐️**

Made with ❤️ by [lzx8589561](https://github.com/lzx8589561)

</div>
