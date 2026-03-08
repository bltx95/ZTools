# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ZTools 是一个高性能、可扩展的 macOS/Windows 应用启动器和插件平台，采用 Electron + Vue 3 + TypeScript 技术栈，提供类似 Alfred/Raycast 的体验。

**核心特性**：

- 🚀 **快速启动**：拼音搜索、正则匹配、历史记录、固定应用
- 🧩 **插件系统**：支持 UI 插件和无界面插件，数据隔离，统一 API
- 📋 **剪贴板管理**：历史记录、搜索、图片支持、跨平台原生实现
- 🔄 **多设备同步**：WebDAV 同步，支持应用历史、固定列表、插件数据
- 🪟 **分离窗口**：插件可独立为窗口，支持多窗口操作
- 🎨 **主题定制**：系统/亮色/暗色模式，6 种主题色，Windows 11 透明材质
- ⚡ **高性能**：LMDB 数据库（3-5x PouchDB 性能），WebContentsView 架构
- 🌍 **跨平台**：macOS 和 Windows 原生支持

**技术亮点**：

- Electron 38 + WebContentsView（替代 BrowserView）
- LMDB 高性能键值数据库（替代 PouchDB）
- 模块化 IPC 架构（shared/renderer/plugin 三层分离）
- 跨平台原生模块（C++ 实现剪贴板监听、窗口管理、区域截图）
- Fuse.js 模糊搜索引擎（拼音、拼音首字母支持）
- WebDAV 数据同步（增量同步、冲突检测）
- CSS 变量 + 自定义控件系统（主题切换）
- 应用目录实时监听（chokidar）
- 内置插件系统（开箱即用）

## 开发命令

```bash
# 开发
pnpm dev          # 启动开发模式（热重载）

# 类型检查
pnpm typecheck:node  # 主进程 + preload
pnpm typecheck:web   # 渲染进程
pnpm typecheck       # 全部

# 构建
pnpm build           # 仅编译源码
pnpm build:mac       # 打包 macOS 应用
pnpm build:unpack    # 打包但不生成安装包（调试用）
```

## 核心架构

### Electron 三层结构

```
Main Process (src/main/)
  ├─ index.ts              # 应用入口
  ├─ appWatcher.ts         # 应用目录监听器（自动检测应用安装/卸载）
  ├─ managers/             # 核心管理器
  │   ├─ windowManager.ts      # 窗口管理、快捷键注册
  │   ├─ pluginManager.ts      # 插件 WebContentsView 管理
  │   └─ clipboardManager.ts   # 剪贴板监听和历史管理
  ├─ api/                  # 模块化 IPC 通信中心
  │   ├─ index.ts          # API 管理器（统一初始化）
  │   ├─ shared/           # 主程序和插件共享的 API
  │   │   ├─ database.ts   # 数据库 API（支持命名空间隔离）
  │   │   ├─ clipboard.ts  # 剪贴板 API
  │   │   └─ imageAnalysis.ts  # 图像分析 API
  │   ├─ renderer/         # 主程序渲染进程专用 API
  │   │   ├─ commands.ts   # 指令管理
  │   │   ├─ plugins.ts    # 插件管理
  │   │   ├─ window.ts     # 窗口控制
  │   │   ├─ settings.ts   # 设置管理
  │   │   ├─ system.ts     # 系统功能
  │   │   ├─ systemSettings.ts # Windows 系统设置集成
  │   │   └─ sync.ts       # WebDAV 同步 API
  │   ├─ plugin/           # 插件专用 API
  │   │   ├─ lifecycle.ts  # 生命周期事件
  │   │   ├─ ui.ts         # UI 控制
  │   │   ├─ window.ts     # 插件窗口管理
  │   │   ├─ dialog.ts     # 对话框
  │   │   ├─ clipboard.ts  # 剪贴板操作
  │   │   ├─ input.ts      # 输入模拟
  │   │   ├─ shell.ts      # Shell 命令
  │   │   ├─ feature.ts    # 插件功能
  │   │   ├─ device.ts     # 设备信息
  │   │   ├─ http.ts       # HTTP 请求
  │   │   ├─ redirect.ts   # 搜索重定向
  │   │   ├─ screen.ts     # 屏幕功能
  │   │   └─ internal.ts   # 内置插件专用 API
  │   └─ updater.ts        # 应用更新 API
  ├─ core/
  │   ├─ commandLauncher/  # 指令启动器
  │   ├─ commandScanner/   # 指令扫描器
  │   ├─ lmdb/             # LMDB 数据持久化（高性能键值数据库）
  │   │   ├─ index.ts      # 主数据库类
  │   │   ├─ lmdbInstance.ts  # 单例实例
  │   │   ├─ syncApi.ts    # 同步 API
  │   │   ├─ promiseApi.ts # Promise API
  │   │   └─ types.ts      # 类型定义
  │   ├─ sync/             # WebDAV 同步引擎
  │   │   ├─ syncEngine.ts # 同步引擎核心
  │   │   ├─ webdavClient.ts # WebDAV 客户端
  │   │   └─ types.ts      # 类型定义
  │   ├─ native/           # 跨平台原生模块接口
  │   ├─ systemSettings/   # Windows 系统设置
  │   ├─ detachedWindowManager.ts  # 分离窗口管理
  │   ├─ pluginWindowManager.ts    # 插件独立窗口管理
  │   ├─ internalPlugins.ts        # 内置插件定义
  │   ├─ internalPluginLoader.ts   # 内置插件加载器
  │   ├─ globalStyles.ts   # 全局样式
  │   └─ screenCapture.ts  # 屏幕截图
  ├─ common/               # 公共模块
  │   ├─ constants.ts      # 常量定义
  │   └─ iconUtils.ts      # 图标工具
  └─ utils/                # 工具函数集合
         ↓ IPC
Preload Script (src/preload/index.ts)
  ├─ contextBridge.exposeInMainWorld('ztools', {...})
  └─ 类型安全的 API 暴露到 window.ztools
         ↓
Renderer Process (src/renderer/)
  ├─ App.vue              # 三种视图模式：Search/Plugin/Settings
  ├─ stores/              # Pinia 状态管理
  │   ├─ commandDataStore.ts  # 指令列表、搜索、历史记录、固定列表
  │   └─ windowStore.ts   # 窗口信息、配置
  └─ components/          # Vue 组件
```

### 插件系统设计

**关键机制**：

- 支持两种插件类型：
  - **UI 插件**：使用 **WebContentsView** 加载界面（`plugin.json` 有 `main` 字段）
  - **无界面插件**：同样使用 **WebContentsView** 但加载空白页面（无 `main` 字段）
    - 判断依据：`plugin.json` 中是否有 `main` 字段
    - 加载 `hideWindow.html`（空白页面）
    - 通过 `window.exports[featureCode]` 导出功能，`mode: 'none'` 标识无界面
    - 调用方式：主进程通过 `call-plugin-method` IPC 调用 `enter()` 方法
- 插件通过 `resources/preload.js` 访问受限的主进程 API
  - 使用 `session.registerPreloadScript()` 注入到所有插件
- 支持两种部署模式：
  - **生产插件**：打包的 ZPX 文件（gzip 压缩的 asar 归档）→ 解压到 `userData/plugins/`
  - **开发插件**：本地文件夹，支持 HTTP URL（如 `http://localhost:5173`）
- 数据隔离：每个插件的数据库操作自动添加 `PLUGIN/{pluginName}/` 前缀（通过 `getPluginPrefix()` 方法识别调用来源）

**插件启动流程**：

```
用户输入 → commandDataStore.search() 匹配
    ↓
launch('plugin:/path/to/plugin:featureCode')
    ↓
pluginManager.createPluginView()
    ↓
1. 从缓存 pluginViews 查找或创建新 BrowserView
2. 设置边界（y=59px, height=541px）
3. 加载插件 URL（本地文件或 HTTP）
4. 发送 on-plugin-enter 事件（携带 launchParam）
```

**插件配置** (`plugin.json`):

```json
{
  "name": "Anywhere",
  "version": "1.0.1",
  "description": "文件快速跳转插件",
  "main": "index.html",
  "preload": "preload.js",
  "logo": "logo.png",
  "features": [
    {
      "code": "search",
      "explain": "搜索文件",
      "icon": "search.png",
      "cmds": [
        "文件搜索",
        {
          "type": "regex",
          "match": "/^find (.+)$/",
          "label": "查找文件",
          "minLength": 5
        },
        {
          "type": "over",
          "label": "处理任意文本",
          "minLength": 3,
          "maxLength": 100,
          "exclude": "/^https?://"
        }
      ]
    }
  ]
}
```

**字段说明**：

- `name` **(必需)**：插件唯一标识符（英文）
- `version` **(必需)**：版本号
- `description`：插件描述
- `main`：UI 插件的入口文件（无界面插件不需要此字段）
- `preload`：自定义 preload 脚本（可选，默认使用系统提供的）
- `logo`：插件图标路径（相对于插件根目录）
- `features` **(必需)**：功能列表
  - `code`：功能代码（用于标识不同功能）
  - `explain`：功能说明
  - `icon`：功能图标（优先级高于插件 logo）
  - `cmds`：命令列表（支持三种类型）

**命令类型**：

1. **功能指令**（字符串）：用于搜索匹配，支持拼音搜索

   ```json
   "cmds": ["文件搜索", "搜索"]
   ```

   - 存入 `commands` 数组
   - 通过 Fuse.js 进行模糊搜索
   - 支持名称、拼音、拼音首字母匹配
   - 适合：固定名称的功能、常用命令

2. **正则匹配指令**（regex）：正则表达式匹配用户输入

   ```json
   {
     "type": "regex",
     "match": "/^calc (.+)$/", // 正则表达式（带斜杠）
     "label": "计算器", // 显示名称
     "minLength": 5 // 最小输入长度
   }
   ```

   - 存入 `regexCommands` 数组
   - 通过正则表达式匹配用户输入
   - 需满足 `minLength` 要求
   - 适合：需要提取参数的命令、格式化输入

3. **任意文本匹配指令**（over）：匹配任意文本（可设置排除规则）

   ```json
   {
     "type": "over",
     "label": "文本处理",
     "minLength": 1, // 最小长度，默认 1
     "maxLength": 10000, // 最大长度，默认 10000
     "exclude": "/^https?:\/\//" // 排除规则（正则表达式）
   }
   ```

   - 存入 `regexCommands` 数组
   - 匹配任意文本（满足长度限制且不被排除）
   - 可通过 `exclude` 设置排除规则
   - 适合：处理任意文本、翻译、转换等

**重要规则**：

- 每个 `feature.cmds` 都会生成独立的搜索项
- **功能指令**（字符串类型）：存入 `commands` 数组，通过 Fuse.js 模糊搜索（支持拼音）
- **匹配指令**（regex/over 类型）：存入 `regexCommands` 数组，独立匹配逻辑
- 插件名本身也作为一个搜索项（不关联具体 feature，或关联默认 feature）
- 插件卸载时，后端自动清理历史记录和固定列表中的相关项
- 插件缓存在 `pluginViews` 数组中，切换时复用（注意内存管理）

### 状态管理 (Pinia)

#### commandDataStore.ts

负责所有指令（应用、系统设置、插件）的核心数据：

**核心概念 - "万物皆指令"**：

所有可搜索的内容（应用、系统设置、插件功能）统一为 `Command` 类型。

**指令类型系统**：

```typescript
export type CommandType =
  | 'direct' // 直接启动（应用 + 系统设置）
  | 'plugin' // 插件功能
  | 'builtin' // 内置功能

export type CommandSubType =
  | 'app' // 系统应用
  | 'system-setting' // 系统设置（仅 Windows）
```

**关键状态**：

- `commands: Command[]` - 用于 Fuse.js 模糊搜索的列表（应用 + 系统设置 + 功能指令）
- `regexCommands: Command[]` - 用于匹配指令的列表（regex/over 类型）
- `history: HistoryItem[]` - 使用历史（最多 27 个）
- `pinnedCommands: Command[]` - 固定指令（最多 18 个）
- `fuse: Fuse<Command>` - 搜索引擎实例
- `isInitialized: boolean` - 是否已初始化
- `loading: boolean` - 是否正在加载

**搜索策略**：

```typescript
search(query: string): {
  bestMatches: SearchResult[],  // Fuse.js 模糊搜索（名称、拼音、拼音首字母）
  regexMatches: SearchResult[]  // 匹配指令结果（regex/over 类型）
}
```

**指令类型详解**：

1. **直接启动指令**（`type: 'direct'`）：
   - **系统应用**（`subType: 'app'`）：
     - macOS: `.app` 应用
     - Windows: `.lnk` 快捷方式
     - 通过 `launchApp()` 启动
   - **系统设置**（`subType: 'system-setting'`，仅 Windows）：
     - 38 个 Windows 系统设置（ms-settings URI）
     - 通过 `shell.openExternal()` 启动
     - 提供统一图标，支持亮/暗色模式

2. **插件指令**（`type: 'plugin'`）：
   - **功能指令**（`cmdType: 'text'`）：
     - 字符串类型的 cmd，如 `"搜索"`
     - 存入 `commands` 数组
     - 支持 Fuse.js 拼音模糊搜索
     - 生成 `pinyin` 和 `pinyinAbbr` 字段
   - **匹配指令**（`cmdType: 'regex' | 'over'`）：
     - 对象类型的 cmd，如 `{ type: 'regex', ... }`
     - 存入 `regexCommands` 数组
     - 独立匹配逻辑（不参与 Fuse 搜索）
     - regex 类型：通过正则表达式匹配，需满足 `minLength`
     - over 类型：匹配任意文本，支持 `minLength`、`maxLength`、`exclude` 规则

**数据加载时机**：

- `initializeData()` - 应用启动时调用一次，并行加载历史、固定列表、指令列表
- `loadCommands()` - 插件安装/删除时刷新
- `reloadUserData()` - 插件删除时刷新历史和固定列表
- 监听后端事件：
  - `history-changed` → 重新加载历史记录
  - `apps-changed` → 重新加载指令列表
  - `pinned-changed` → 重新加载固定列表

#### windowStore.ts

窗口和 UI 配置：

**关键状态**：

- `currentWindow: WindowInfo | null` - 打开前激活的窗口信息（用于恢复）
- `currentPlugin: PluginInfo | null` - 当前显示的插件信息
- `placeholder: string` - 主搜索框占位符
- `avatar: string` - 头像
- `subInputPlaceholder: string` - 子输入框占位符（插件模式）
- `autoPaste: AutoPasteOption` - 自动粘贴配置（off/1s/3s/5s/10s）
- `theme: string` - 主题模式（system/light/dark）
- `primaryColor: string` - 主题色（blue/purple/green/orange/red/pink）

**方法**：

- `updateWindowInfo()` - 更新窗口信息
- `isFinder()` - 判断当前是否为 Finder
- `updateCurrentPlugin()` - 更新当前插件信息
- `updateSubInputPlaceholder()` - 更新子输入框占位符
- `getAutoPasteTimeLimit()` - 获取自动粘贴时间限制（毫秒）
- `loadSettings()` - 从数据库加载设置

### 数据持久化 (LMDB)

**技术选型**：从 PouchDB 迁移到 LMDB，性能提升显著（读写速度 ⚡⚡⚡，内存占用 📉 极低）

**存储结构**：

```typescript
// 数据库路径: app.getPath('userData')/lmdb
// 三个数据库：main（主数据）、meta（元数据）、attachment（附件）

interface DbDoc {
  _id: string // 文档 ID（必需）
  _rev?: string // 文档版本号（LMDB 自动管理）
  data?: any // 实际数据（主程序使用）
  [key: string]: any // 自定义字段（插件使用）
}
```

**命名空间约定**：

- `ZTOOLS/` - 主程序数据
  - `ZTOOLS/plugins` - 插件列表
  - `ZTOOLS/command-history` - 命令使用历史
  - `ZTOOLS/pinned-commands` - 固定指令列表
  - `ZTOOLS/settings-general` - 通用设置
  - `ZTOOLS/detachedWindowSizes` - 分离窗口尺寸（按插件名存储）
  - `ZTOOLS/outKillPlugin` - 退出时关闭的插件列表
  - `ZTOOLS/autoDetachPlugin` - 自动分离的插件列表
- `PLUGIN/{pluginName}/` - 插件专属数据（自动隔离）
  - 插件调用 `db.put({ _id: 'config' })` → 实际存储为 `PLUGIN/my-plugin/config`
  - 前缀自动添加和移除，插件无感知
- `SYNC/` - 同步相关数据
  - `SYNC/config` - 同步配置（包含 url、username、encryptedPassword、enabled 等）
- `CLIPBOARD/` - 剪贴板历史（未使用，改用附件存储）

**注意**：通过 `window.ztools.dbGet(key)` 和 `window.ztools.dbPut(key, data)` 访问的键会自动添加 `ZTOOLS/` 前缀，例如：

- `dbGet('settings-general')` → 实际读取 `ZTOOLS/settings-general`
- `dbPut('detachedWindowSizes', data)` → 实际写入 `ZTOOLS/detachedWindowSizes`

**附件存储**：

- 附件 ID 格式：`attachment:{docId}`
- 元数据格式：`attachment-ext:{docId}` → JSON 字符串（包含 type、size 等）
- 图片保存到 `userData/clipboard/images/`
- 支持类型：文本、图片（PNG）、文件列表

**API 模式**：

- 同步 API：`db.put(doc)`、`db.get(id)` - 插件使用（通过 `ipcRenderer.sendSync`）
- Promise API：`db.promises.put(doc)` - 主进程内部使用
- dbStorage API：`dbStorage.setItem(key, value)` - 类似 localStorage 的简化接口

### IPC 通信模式

**模块化架构**（`src/main/api/index.ts` 统一管理）：

**共享 API**（主程序和插件都可用）：

- `db:put/get/remove/bulk-docs/all-docs` - 数据库操作（自动处理命名空间）
- `db:post-attachment/get-attachment` - 附件操作
- `db-storage:set-item/get-item/remove-item` - 简化的存储接口
- `clipboard:*` - 剪贴板操作

**主程序渲染进程专用**：

- `get-commands` - 扫描系统指令（`commandScanner`）
- `launch` - 启动应用或插件
- `import-plugin` - 导入 ZPX 插件
- `import-dev-plugin` - 添加开发插件
- `delete-plugin` - 删除插件 + 清理历史和固定列表
- `get-plugins` - 获取插件列表
- `ztools:db-put/db-get` - 直接操作 ZTOOLS 命名空间

**插件专用 API**（`src/main/api/plugin/`）：

- `plugin-lifecycle:*` - 生命周期事件（onPluginEnter、onPluginLeave）
- `plugin-ui:*` - UI 控制（setExpendHeight、hideWindow、setSubInput）
- `plugin-window:*` - 窗口管理（创建独立窗口、获取窗口列表）
- `plugin-dialog:*` - 对话框（showMessageBox、showOpenDialog）
- `plugin-clipboard:*` - 剪贴板扩展操作
- `plugin-input:*` - 输入模拟（sendInputEvent）
- `plugin-shell:*` - Shell 命令执行
- `plugin-feature:*` - 插件功能管理
- `plugin-device:*` - 设备信息（系统版本、设备型号等）
- `plugin-http:*` - HTTP 请求功能
- `plugin-redirect:*` - 搜索重定向功能
- `plugin-screen:*` - 屏幕功能（截图等）
- `plugin-internal:*` - 内置插件专用 API（更高权限）

**图像处理 API**（直接在 preload 中通过 `require('sharp')` 提供，无需 IPC）：

- `ztools.sharp([input], [options])` - 获取 Sharp 实例，支持所有链式方法（resize/rotate/toBuffer/toFile 等）

**事件推送**（Main → Renderer）：

- `focus-search` - 显示搜索窗口
- `plugins-changed` - 插件列表变化（安装/删除后）
- `plugin-opened` / `plugin-closed` - 插件生命周期
- `window-info-changed` - 窗口信息更新
- `ipc-launch` - 通过全局快捷键启动插件

### 系统设置集成（Windows）

**概述**：ZTools 支持 Windows 系统设置作为可搜索指令，提供快速访问常用系统功能。

**技术实现**：

```typescript
// src/main/core/systemSettings/windowsSettings.ts
export interface SystemSetting {
  name: string // 中文名称
  nameEn?: string // 英文名称
  uri: string // ms-settings URI
  category: string // 分类
  icon: string // 图标路径（统一使用 settings-fill.png）
  keywords?: string[] // 搜索关键词
}

// 38 个常用系统设置
export const WINDOWS_SETTINGS: SystemSetting[] = [
  { name: '显示设置', uri: 'ms-settings:display', category: '系统', icon: '...' },
  { name: '网络和 Internet', uri: 'ms-settings:network', category: '网络', icon: '...' }
  // ...
]
```

**加载流程**：

```
应用启动 → 检测 Windows 平台
    ↓
loadCommands() 加载系统设置
    ↓
转换为 Command 对象（type: 'direct', subType: 'system-setting'）
    ↓
添加拼音索引，加入 commands 数组
    ↓
用户搜索 → Fuse.js 匹配 → 启动 shell.openExternal(uri)
```

**图标处理**：

- 统一图标：`resources/icons/settings-fill.png`（白色 SVG）
- 开发模式：`app.getAppPath()/resources/icons/settings-fill.png`
- 打包模式：`process.resourcesPath/icons/settings-fill.png`
- 转换为 `file:///` 协议供渲染进程使用
- CSS 滤镜：亮色模式显示为灰色，暗色模式保持白色

**分类覆盖**：

- 系统（显示、声音、通知、电源等）
- 网络（Wi-Fi、以太网、代理等）
- 个性化（主题、颜色、锁屏等）
- 账户（用户账户、登录选项等）
- 时间和语言（日期、区域、语言等）
- 隐私和安全（定位、相机、麦克风等）
- 更新和安全（Windows 更新、恢复等）
- 应用（默认应用、启动等）

### 剪贴板系统

**原生模块**（`src/main/core/native/index.ts`）：

- 跨平台支持：macOS ✅ / Windows ✅
- 监听系统剪贴板变化（自动去重）
- 监听窗口激活事件（记录复制来源）
- 原生模块文件：
  - macOS: `resources/lib/mac/ztools_native.node`
  - Windows: `resources/lib/win/ztools_native.node`

**数据流**：

```
系统剪贴板变化 → 原生模块回调
    ↓
clipboardManager.handleClipboardChange()
    ↓
解析类型（优先级：文件 > 图片 > 文本）
    ↓
生成 ClipboardItem（含 hash、时间戳、来源应用）
    ↓
保存到 LMDB 附件存储 + 清理旧记录
    ↓
通知插件：pluginManager.sendPluginMessage('clipboard-change', item)
```

**图片处理规则**：

- 单张限制：10MB
- 总容量限制：500MB
- 超限时自动清理最旧图片
- 图片存储位置：`userData/clipboard/images/`

### WebDAV 同步系统

**概述**：ZTools 支持通过 WebDAV 协议实现多设备数据同步，包括应用历史、固定列表、插件数据等。

**核心特性**：

- 🔄 **增量同步**：只同步变更的数据，减少网络传输
- 🔒 **冲突检测**：基于时间戳的冲突检测和解决机制
- 💾 **离线优先**：本地数据优先，后台自动同步
- 🔐 **安全存储**：密码使用 Electron safeStorage 加密存储
- 🌍 **跨平台**：macOS 和 Windows 完整支持

**技术架构**：

```
syncEngine.ts (同步引擎)
    ↓
webdavClient.ts (WebDAV 客户端)
    ↓
同步数据分类：
  - 设置数据 (ZTOOLS/settings-general)
  - 插件数据 (PLUGIN/*/*)
```

**同步的数据**：

- 通用设置（`ZTOOLS/settings-general`）✅
- 所有插件数据（`PLUGIN/` 前缀）✅

**不同步的数据**（隐私保护）：

- ❌ 命令历史（`ZTOOLS/command-history`）
- ❌ 固定指令列表（`ZTOOLS/pinned-commands`）

**同步流程**：

```
1. 用户配置 WebDAV 服务器（URL、用户名、密码）
    ↓
2. 启用同步开关
    ↓
3. syncEngine 定期检查本地和远程数据
    ↓
4. 对比 _lastModified 时间戳
    ↓
5. 上传/下载变更的数据
    ↓
6. 冲突检测：如果两端都有修改，取最新时间戳的数据
    ↓
7. 更新本地 LMDB 数据库
    ↓
8. 通知 UI 刷新
```

**关键实现**（`src/main/core/sync/`）：

- **syncEngine.ts**：
  - `startSync()` - 启动同步
  - `syncNow()` - 立即同步
  - `resolveConflict()` - 冲突解决（基于时间戳）
  - 定时同步（可配置间隔）

- **webdavClient.ts**：
  - `connect()` - 连接 WebDAV 服务器
  - `uploadFile()` / `downloadFile()` - 文件上传/下载
  - `listFiles()` - 列出远程文件
  - `delete()` - 删除远程文件

**配置存储**：

- 配置保存在 `ZTOOLS/settings-sync`
- 密码通过 `safeStorage.encryptString()` 加密
- 字段：`url`, `username`, `encryptedPassword`, `enabled`, `syncInterval`

**API 接口**（`src/main/api/renderer/sync.ts`）：

- `sync:save-config` - 保存同步配置
- `sync:get-config` - 获取同步配置
- `sync:test-connection` - 测试连接
- `sync:start` - 启动同步
- `sync:stop` - 停止同步
- `sync:sync-now` - 立即同步

### 分离窗口系统

**概述**：支持将插件从主窗口中分离为独立窗口，提供更灵活的多窗口使用体验。

**核心特性**：

- 🪟 **独立窗口**：将任意插件分离为独立窗口
- 💾 **窗口记忆**：自动保存和恢复窗口尺寸、位置
- 🎨 **材质支持**：Windows 11 支持 Mica/Acrylic 透明材质，macOS 支持亚克力材质
- 🎯 **自定义标题栏**：52px 高度的自定义标题栏，支持拖拽、最小化、关闭

**技术实现**（`src/main/core/detachedWindowManager.ts`）：

```typescript
class DetachedWindowManager {
  // 分离插件为独立窗口
  detachPlugin(plugin: PluginInfo): BrowserWindow

  // 恢复插件到主窗口
  attachPlugin(pluginName: string): void

  // 获取插件窗口尺寸（从数据库读取）
  getPluginWindowSize(pluginName: string): { width: number; height: number }

  // 保存窗口尺寸（到数据库）
  savePluginWindowSize(pluginName: string, width: number, height: number): void
}
```

**窗口配置**：

```typescript
const window = new BrowserWindow({
  width: savedWidth || 800,
  height: savedHeight || 600,
  frame: false, // 无边框窗口
  titleBarStyle: 'hidden', // macOS 隐藏标题栏
  backgroundColor: materialBgColor, // 根据材质设置背景色
  vibrancy: 'under-window', // macOS 亚克力材质
  backgroundMaterial: 'mica' // Windows 11 Mica 材质
})
```

**自定义标题栏**（`src/renderer/src/components/detached/DetachedTitlebar.vue`）：

- 高度：52px（`DETACHED_TITLEBAR_HEIGHT`）
- 功能：显示插件名称、最小化、关闭按钮
- 支持拖拽移动窗口（`-webkit-app-region: drag`）
- 按钮区域不可拖拽（`-webkit-app-region: no-drag`）

**数据持久化**：

- 窗口尺寸保存在 `ZTOOLS/detached-window-sizes`
- 格式：`{ [pluginName]: { width, height } }`
- 窗口关闭时自动保存，下次打开时恢复

**使用方式**：

```javascript
// 分离插件
window.ztools.detachPlugin('plugin-name')

// 插件会在新窗口中打开，主窗口可以继续使用
```

### 应用监听系统

**概述**：自动监听系统应用目录变化，实时检测应用的安装和卸载，无需手动刷新。

**核心特性**：

- 📁 **目录监听**：使用 chokidar 监听应用目录
- ⚡ **实时更新**：应用安装/卸载后自动刷新列表
- 🔄 **防抖处理**：1 秒延迟，避免频繁扫描
- 🎯 **跨平台**：macOS 和 Windows 完整支持

**技术实现**（`src/main/appWatcher.ts`）：

```typescript
class AppWatcher {
  private watcher: FSWatcher | null = null

  // 启动监听
  start(): void {
    const watchPaths = this.getWatchPaths()

    this.watcher = chokidar.watch(watchPaths, {
      ignored: /^\./,
      persistent: true,
      ignoreInitial: true,
      depth: 2 // 递归深度
    })

    // 监听文件变化
    this.watcher.on('add', this.handleChange)
    this.watcher.on('unlink', this.handleChange)
    this.watcher.on('addDir', this.handleChange)
    this.watcher.on('unlinkDir', this.handleChange)
  }

  // 处理变化（防抖 1 秒）
  private handleChange = debounce(() => {
    this.rescanApps()
  }, 1000)

  // 重新扫描应用
  private async rescanApps(): Promise<void> {
    const commands = await scanCommands()
    // 通知渲染进程刷新
    mainWindow.webContents.send('apps-changed', commands)
  }
}
```

**监听路径**：

- **macOS**：
  - `/Applications`
  - `/System/Applications`
  - `~/Applications`

- **Windows**：
  - `C:\ProgramData\Microsoft\Windows\Start Menu\Programs`
  - `%APPDATA%\Microsoft\Windows\Start Menu\Programs`

**工作流程**：

```
应用安装/卸载 → 目录变化
    ↓
chokidar 触发 add/unlink 事件
    ↓
防抖 1 秒（避免频繁触发）
    ↓
调用 scanCommands() 重新扫描
    ↓
发送 apps-changed 事件到渲染进程
    ↓
commandDataStore.loadCommands() 刷新列表
    ↓
UI 自动更新
```

### 内置插件系统

**概述**：ZTools 支持内置插件，提供核心功能，无需用户手动安装。

**核心特性**：

- 📦 **预装插件**：随应用一起打包，开箱即用
- 🔧 **核心功能**：提供设置、系统工具等核心功能
- 🔄 **自动加载**：应用启动时自动加载
- 🎯 **独立代码**：与外部插件隔离，便于维护

**技术实现**：

**内置插件定义**（`src/main/core/internalPlugins.ts`）：

```typescript
export interface InternalPlugin {
  name: string // 插件名称
  dirName: string // 目录名称
  description: string // 描述
  enabled: boolean // 是否启用
}

export const INTERNAL_PLUGINS: InternalPlugin[] = [
  {
    name: 'setting',
    dirName: 'setting',
    description: '应用设置',
    enabled: true
  }
  // 更多内置插件...
]
```

**加载器**（`src/main/core/internalPluginLoader.ts`）：

```typescript
class InternalPluginLoader {
  // 获取内置插件路径
  getInternalPluginPath(dirName: string): string {
    if (isDev) {
      // 开发环境：从源码目录加载
      return path.join(process.cwd(), 'internal-plugins', dirName)
    } else {
      // 生产环境：从 app.asar.unpacked 加载
      return path.join(process.resourcesPath, 'internal-plugins', dirName)
    }
  }

  // 加载所有内置插件
  loadInternalPlugins(): Plugin[] {
    return INTERNAL_PLUGINS.filter((p) => p.enabled).map((p) => this.loadPlugin(p.dirName))
  }
}
```

**打包配置**（`electron-builder.yml`）：

```yaml
asarUnpack:
  - internal-plugins/** # 内置插件不打包到 asar，方便热更新
```

**当前内置插件**：

1. **setting** - 应用设置插件
   - 路径：`internal-plugins/setting/`
   - 功能：提供应用设置界面（主题、快捷键、同步等）
   - 特点：使用与外部插件相同的 API，便于移植

**内置插件 API**（`src/main/api/plugin/internal.ts`）：

内置插件专用的 API，提供更高级的系统权限：

- `internal:get-system-info` - 获取系统信息
- `internal:get-app-paths` - 获取应用路径
- `internal:restart-app` - 重启应用
- 其他系统级操作...

**加载时机**：

```
应用启动 → internalPluginLoader.loadInternalPlugins()
    ↓
加载 plugin.json 并验证
    ↓
添加到 pluginManager 的插件列表
    ↓
与外部插件一起管理
    ↓
用户可以像使用外部插件一样使用内置插件
```

### 插件市场系统

**概述**：ZTools 提供内置的插件市场，用户可以在线浏览、安装、升级插件，无需手动下载和解压 ZPX 文件。

**技术架构**：

```
插件托管（蓝奏云）
    ↓
fetchPluginMarket() - 获取插件列表
    ↓
PluginMarket.vue - 展示插件卡片
    ↓
installPluginFromMarket() - 下载并安装插件
    ↓
自动解压到 userData/plugins/
    ↓
刷新插件列表 + 通知渲染进程
```

**关键实现**（`src/main/api/renderer/plugins.ts`）：

1. **获取插件市场列表**：

   ```typescript
   private async fetchPluginMarket(): Promise<any> {
     // 蓝奏云文件夹: https://ilt.lanzouu.com/b0pn75v9g
     // 密码: 5w87
     const fileList = await getLanzouFolderFileList(folderUrl, password)
     // 解析插件信息 JSON 文件
     // 返回插件列表（包含 name, version, downloadUrl 等）
   }
   ```

2. **从市场安装插件**：

   ```typescript
   private async installPluginFromMarket(plugin: any): Promise<any> {
     // 1. 获取蓝奏云真实下载链接
     const realDownloadUrl = await getLanzouDownloadLink(plugin.downloadUrl)

     // 2. 下载 ZPX 文件到临时目录
     await downloadFile(realDownloadUrl, tempZpxPath)

     // 3. 使用 zpxArchive 解压到 userData/plugins/{pluginName}/
     await extractZpx(tempZpxPath, targetDir)

     // 4. 验证 plugin.json 是否存在
     // 5. 加载插件并通知渲染进程
   }
   ```

3. **插件升级流程**（`PluginMarket.vue`）：

   ```typescript
   async function handleUpgradePlugin(plugin: Plugin) {
     // 1. 版本比较（compareVersions）
     if (localVersion >= marketVersion) return

     // 2. 确认升级
     // 3. 卸载旧版本：deletePlugin(plugin.path)
     // 4. 安装新版本：installPluginFromMarket(plugin)
     // 5. 刷新列表
   }
   ```

**前端展示**（`src/renderer/src/components/PluginMarket.vue`）：

- 网格布局展示插件卡片（2 列）
- 插件状态：
  - 未安装：显示下载按钮
  - 已安装（无更新）：显示"打开"按钮
  - 已安装（有更新）：显示"升级"按钮（橙色）
- 点击插件名称查看详情（PluginDetail.vue）

**工具函数**（`src/main/utils/`）：

- `zpxArchive.ts` - ZPX 归档工具（@electron/asar + gzip）
  - `packZpx()` - 将目录打包为 ZPX 文件
  - `extractZpx()` - 解压 ZPX 文件到目录
  - `readFileFromZpx()` - 从 ZPX 中读取单个文件（Buffer）
  - `readTextFromZpx()` - 从 ZPX 中读取文本文件
  - `existsInZpx()` - 检查文件是否存在于 ZPX 中
  - `isValidZpx()` - 验证文件是否为有效的 ZPX 格式
- `lanzou.ts` - 蓝奏云 API 封装
  - `getLanzouFolderFileList()` - 获取文件夹列表
  - `getLanzouDownloadLink()` - 解析真实下载链接
- `download.ts` - 文件下载工具
  - `downloadFile()` - HTTP 下载到本地文件

### 应用内更新系统

**概述**：ZTools 支持应用内一键更新，无需用户手动下载安装包，提供类似 Chrome/VSCode 的自动更新体验。

**技术架构**：

```
更新源（蓝奏云）
    ↓
checkUpdate() - 检查更新版本
    ↓
显示更新提示（版本号、更新日志）
    ↓
startUpdate() - 下载更新包
    ↓
解压 app.asar + app.asar.unpacked
    ↓
启动独立 updater 程序
    ↓
应用退出
    ↓
updater 替换 app.asar 文件
    ↓
updater 重启应用
```

**关键实现**（`src/main/api/updater.ts`）：

1. **检查更新**：

   ```typescript
   private async checkUpdate(): Promise<any> {
     // 1. 获取蓝奏云文件夹列表（https://ilt.lanzouu.com/b0pn8htad，密码: 1f8i）
     const fileList = await getLanzouFolderFileList(updateCheckUrl, updateCheckPwd)

     // 2. 查找最新版本文件（格式：ztools_update_1.0.1.txt）
     const versionRegex = /ztools_update_(\d+(\.\d+)*)\.txt/

     // 3. 比较版本号（compareVersions）
     if (latestVersion <= currentVersion) {
       return { hasUpdate: false }
     }

     // 4. 下载并解析更新信息 JSON
     const updateInfo = JSON.parse(content)
     // 包含字段：version, downloadUrl, downloadUrlWin64, downloadUrlMacArm, changelog

     return { hasUpdate: true, updateInfo }
   }
   ```

2. **执行更新**：

   ```typescript
   private async startUpdate(updateInfo: any): Promise<any> {
     // 1. 根据平台选择下载链接
     let downloadUrl = updateInfo.downloadUrl
     if (isWin && updateInfo.downloadUrlWin64) {
       downloadUrl = updateInfo.downloadUrlWin64
     } else if (isMac && isArm64 && updateInfo.downloadUrlMacArm) {
       downloadUrl = updateInfo.downloadUrlMacArm
     }

     // 2. 获取真实下载链接
     const realDownloadUrl = await getLanzouDownloadLink(downloadUrl)

     // 3. 下载更新包到临时目录
     const tempZipPath = path.join(app.getPath('userData'), 'ztools-update-pkg', ...)
     await downloadFile(realDownloadUrl, tempZipPath)

     // 4. 解压更新包
     const zip = new AdmZip(tempZipPath)
     zip.extractAllToAsync(extractPath, ...)

     // 5. 重命名 app.asar.tmp -> app.asar
     // （打包时为了避免被识别为 asar 导致解压问题）

     // 6. 准备 updater 参数
     const args = [
       '--asar-src', asarSrc,           // 新的 app.asar 路径
       '--asar-dst', asarDst,           // 应用的 app.asar 路径
       '--app', appPath,                // 应用可执行文件路径
       '--unpacked-src', unpackedSrc,   // 新的 app.asar.unpacked 路径
       '--unpacked-dst', unpackedDst    // 应用的 app.asar.unpacked 路径
     ]

     // 7. 启动 updater（detached 模式）
     const subprocess = spawn(updaterPath, args, { detached: true, stdio: 'ignore' })
     subprocess.unref()

     // 8. 退出应用
     app.quit()
   }
   ```

**Updater 程序**：

- 独立的可执行文件（非 Node.js，避免依赖主应用）
- macOS: `ztools-updater`（位于 `Contents/MacOS/`）
- Windows: `ztools-agent.exe`（位于应用根目录）
- 职责：
  1. 等待主应用完全退出
  2. 复制新的 `app.asar` 和 `app.asar.unpacked` 到应用目录
  3. 重启应用
  4. 清理临时文件

**平台差异**：

- **macOS**：
  - app.asar 位置：`Contents/Resources/app.asar`
  - updater 位置：`Contents/MacOS/ztools-updater`
  - 应用路径：`Contents/MacOS/ZTools`

- **Windows**：
  - app.asar 位置：`resources/app.asar`
  - updater 位置：应用根目录 `ztools-agent.exe`
  - 应用路径：`ZTools.exe`

**更新信息文件格式**（`ztools_update_x.x.x.txt`）：

```json
{
  "version": "1.0.9",
  "downloadUrl": "https://ilt.lanzouu.com/...", // 通用下载链接
  "downloadUrlWin64": "https://ilt.lanzouu.com/...", // Windows x64 专用
  "downloadUrlMacArm": "https://ilt.lanzouu.com/...", // macOS Apple Silicon 专用
  "changelog": ["修复 Bug A", "新增功能 B", "优化性能 C"]
}
```

**前端展示**（`src/renderer/src/components/Settings.vue`）：

- 显示当前版本号
- "检查更新"按钮
- 发现更新时显示：
  - 新版本号
  - 更新日志
  - "立即更新"按钮
- 更新进度提示（下载中、安装中）

## 关键代码路径

### 修改插件系统

- `src/main/managers/pluginManager.ts` - WebContentsView 创建和管理
- `src/main/api/renderer/plugins.ts` - 插件安装/删除逻辑
- `src/main/api/plugin/` - 插件可用的所有 API 实现
- `resources/preload.js` - 插件可用的 API（注入到插件上下文）
- `src/main/core/internalPlugins.ts` - 内置插件定义
- `src/main/core/internalPluginLoader.ts` - 内置插件加载器
- `internal-plugins/` - 内置插件源码目录

### 修改 UI 组件和样式

- `src/renderer/src/style.css` - 全局样式和通用控件类（按钮、输入框、开关、卡片等）
- `src/renderer/src/components/` - Vue 组件（应优先使用通用控件类）
- `src/renderer/src/components/AllCommands.vue` - 所有指令管理页面（显示应用、系统设置、插件指令）
- 参考"UI 组件开发（控件样式系统）"章节了解可用的控件类

### 修改搜索逻辑

- `src/renderer/src/stores/commandDataStore.ts` - 搜索引擎和数据加载（Command 类型系统）
- `src/renderer/src/components/SearchResults.vue` - 搜索结果展示和键盘导航
- `src/main/core/systemSettings/windowsSettings.ts` - Windows 系统设置定义
- `src/main/core/commandScanner/` - 指令扫描器（macOS/Windows）
- `src/main/core/commandLauncher/` - 指令启动器（macOS/Windows）

### 修改数据持久化

- `src/main/core/lmdb/index.ts` - LMDB Database 类（主入口）
- `src/main/core/lmdb/lmdbInstance.ts` - 单例实例
- `src/main/core/lmdb/syncApi.ts` - 同步 API 实现
- `src/main/core/lmdb/promiseApi.ts` - Promise API 实现
- `src/main/api/shared/database.ts` - IPC 数据库 API（命名空间隔离）

### 修改剪贴板功能

- `src/main/clipboardManager.ts` - 剪贴板监听和历史管理
- `src/main/core/native/index.ts` - 跨平台原生模块接口
- `resources/lib/mac/ztools_native.node` - macOS 原生模块（C++ 编写）
- `resources/lib/win/ztools_native.node` - Windows 原生模块（C++ 编写）

### 修改 IPC 通信

- `src/main/api/index.ts` - API 管理器（统一初始化所有模块）
- `src/main/api/shared/` - 共享 API 模块
- `src/main/api/renderer/` - 主程序 API 模块
- `src/main/api/plugin/` - 插件 API 模块

### 修改插件市场功能

- `src/main/api/renderer/commands.ts` - 指令管理 API 实现
- `src/main/api/renderer/plugins.ts` - 插件市场 API 实现
  - `fetchPluginMarket()` - 获取插件市场列表
  - `installPluginFromMarket()` - 从市场安装插件
- `src/renderer/src/components/PluginMarket.vue` - 插件市场 UI 界面
  - 插件列表展示（网格布局）
  - 插件状态管理（未安装/已安装/可升级）
  - 插件升级流程（`handleUpgradePlugin()`）
- `src/renderer/src/components/PluginDetail.vue` - 插件详情弹窗
- `src/main/utils/zpxArchive.ts` - ZPX 归档工具（asar + gzip）
  - `packZpx()` / `extractZpx()` - 打包/解压 ZPX
  - `readFileFromZpx()` / `readTextFromZpx()` - 读取 ZPX 内文件
- `src/main/utils/lanzou.ts` - 蓝奏云 API 工具
  - `getLanzouFolderFileList()` - 获取蓝奏云文件夹列表
  - `getLanzouDownloadLink()` - 解析真实下载链接
- `src/main/utils/download.ts` - 文件下载工具
  - `downloadFile()` - HTTP 下载到本地文件

### 修改应用内更新功能

- `src/main/api/updater.ts` - 应用更新 API 实现
  - `checkUpdate()` - 检查更新
  - `startUpdate()` - 执行更新流程
- `src/renderer/src/components/Settings.vue` - 设置界面（包含更新检查）
- `src/updater/` - 独立更新程序源码（如果有）
  - `mac-arm64/ztools-updater` - macOS 更新程序
  - `win-x64/ztools-agent.exe` - Windows 更新程序
- `resources/` - 打包后的更新程序位置
  - macOS: 复制到 `Contents/MacOS/ztools-updater`
  - Windows: 复制到应用根目录 `ztools-agent.exe`

### 修改 WebDAV 同步功能

- `src/main/core/sync/syncEngine.ts` - 同步引擎核心实现
- `src/main/core/sync/webdavClient.ts` - WebDAV 客户端
- `src/main/core/sync/types.ts` - 同步相关类型定义
- `src/main/api/renderer/sync.ts` - 同步 API（IPC 接口）
- `src/renderer/src/components/Settings.vue` - 设置界面（同步配置 UI）

### 修改分离窗口功能

- `src/main/core/detachedWindowManager.ts` - 分离窗口管理器
- `src/renderer/src/components/detached/DetachedTitlebar.vue` - 分离窗口标题栏
- `src/main/managers/windowManager.ts` - 窗口管理器（集成分离窗口）

### 修改应用监听功能

- `src/main/appWatcher.ts` - 应用目录监听器
- `src/main/core/commandScanner/` - 指令扫描器（被 appWatcher 调用）
- `src/renderer/src/stores/commandDataStore.ts` - 处理 apps-changed 事件

## 常见任务指南

### 添加新的 IPC 接口

#### 主程序渲染进程 API（推荐）

在 `src/main/api/{shared|renderer}/xxx.ts` 中添加 handler：

```typescript
// 例如：在 src/main/api/renderer/commands.ts 中添加新功能
import { ipcMain } from 'electron'

export class CommandsAPI {
  private mainWindow: Electron.BrowserWindow | null = null

  public init(mainWindow: Electron.BrowserWindow, pluginManager: any): void {
    this.mainWindow = mainWindow
    this.setupIPC()
  }

  private setupIPC(): void {
    ipcMain.handle('my-new-feature', async (_event, param) => {
      // 实现逻辑
      return { success: true, data: result }
    })
  }
}
```

在 `src/preload/index.ts` 中暴露给主程序渲染进程：

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ztools', {
  // ... 其他 API
  myNewFeature: (param) => ipcRenderer.invoke('my-new-feature', param)
})
```

在 `src/renderer/src/env.d.ts` 中添加类型定义：

```typescript
interface Window {
  ztools: {
    // ... 其他 API
    myNewFeature: (param: string) => Promise<{ success: boolean; data?: any }>
  }
}
```

#### 插件 API（专用）

在 `src/main/api/plugin/xxx.ts` 中添加插件专用功能：

```typescript
// 例如：在 src/main/api/plugin/ui.ts 中添加新功能
import { ipcMain } from 'electron'

export class PluginUIAPI {
  private pluginManager: any = null

  public init(mainWindow: Electron.BrowserWindow, pluginManager: any): void {
    this.pluginManager = pluginManager
    this.setupIPC()
  }

  private setupIPC(): void {
    ipcMain.handle('plugin:my-feature', async (event, param) => {
      // 获取调用插件的信息
      const pluginInfo = this.pluginManager.getPluginInfoByWebContents(event.sender)

      // 实现插件专用逻辑
      return { success: true, data: result }
    })
  }
}
```

在 `resources/preload.js` 中暴露给插件（**注意：不经过 Vite 构建**）：

```javascript
// resources/preload.js
const electron = require('electron')

// 暴露到 window.ztools
window.ztools = {
  // ... 其他 API
  myFeature: (param) => {
    return electron.ipcRenderer.invoke('plugin:my-feature', param)
  }
}
```

**重要提示**：

- `resources/preload.js` 修改后需要**重启应用**才能生效
- 插件 API 的 IPC 通道名建议加 `plugin:` 前缀，便于区分
- 插件 API 应该考虑数据隔离和安全性
- 不需要修改 `plugin-types.d.ts`，插件自己会定义类型

#### 创建新模块（功能较复杂时）

1. 创建 `src/main/api/{category}/newModule.ts`：

```typescript
import { ipcMain } from 'electron'

export class NewModuleAPI {
  private mainWindow: Electron.BrowserWindow | null = null

  public init(mainWindow: Electron.BrowserWindow): void {
    this.mainWindow = mainWindow
    this.setupIPC()
  }

  private setupIPC(): void {
    // 注册 IPC handlers
  }
}

export default new NewModuleAPI()
```

2. 在 `src/main/api/index.ts` 中导入并初始化：

```typescript
import newModuleAPI from './category/newModule.js'

class APIManager {
  public init(mainWindow: BrowserWindow, pluginManager: any): void {
    // ... 其他模块初始化
    newModuleAPI.init(mainWindow)
  }
}
```

### 添加新的 Pinia Store

1. 创建 `src/renderer/src/stores/xxxStore.ts`
2. 使用 `defineStore` 定义状态和方法
3. 在 `App.vue` 或组件中导入使用

### 修改插件 API

插件可用的 API 定义在 `resources/preload.js`（**不经过 Vite 构建**）：

- 修改后需要重启应用才能生效
- 无界面插件开发指南已整合到本文档的"开发无界面插件"章节

### UI 组件开发（控件样式系统）

项目在 `src/renderer/src/style.css` 中定义了一套完整的通用控件样式类，基于 **CSS 变量系统**实现主题切换，遵循以下设计原则：

1. **CSS 变量驱动**：使用 CSS 变量（`--primary-color`、`--control-bg` 等）实现主题动态切换
2. **默认低调**：所有控件默认使用中性色（`--control-bg` 和 `--control-border`）
3. **悬浮高亮**：鼠标悬浮时显示对应的主题色反馈
4. **类型区分**：根据操作类型使用不同的颜色语义
5. **一致性**：所有控件遵循相同的视觉语言和交互模式

**主题系统**：

- 通过修改 CSS 变量实现主题切换（亮色/暗色/系统）
- 支持 6 种主题色：blue、purple、green、orange、red、pink
- 使用 `@media (prefers-color-scheme: dark)` 自动适配系统主题
- Windows 11 支持透明材质（Mica/Acrylic）

#### 可用的控件类

**1. 按钮 `.btn`**

```vue
<!-- 基础用法 -->
<button class="btn">默认按钮</button>

<!-- 尺寸变体 -->
<button class="btn btn-sm">小按钮</button>
<!-- padding: 4px 12px, font-size: 12px -->
<button class="btn btn-md">中按钮</button>
<!-- padding: 6px 14px, font-size: 13px -->
<button class="btn btn-lg">大按钮</button>
<!-- padding: 10px 20px, font-size: 15px -->

<!-- 类型变体（悬浮时显示对应颜色）-->
<button class="btn btn-primary">主要操作</button>
<!-- 蓝色/主题色 -->
<button class="btn btn-danger">删除操作</button>
<!-- 红色 -->
<button class="btn btn-warning">警告操作</button>
<!-- 黄色 -->
<button class="btn btn-success">成功操作</button>
<!-- 绿色 -->
<button class="btn btn-purple">特殊操作</button>
<!-- 紫色 -->

<!-- 实心按钮（默认就显示主题色背景）-->
<button class="btn btn-solid">确认</button>

<!-- 组合使用 -->
<button class="btn btn-sm btn-danger">删除</button>
<button class="btn btn-lg btn-solid">确认</button>
```

**图标按钮变体**：

项目提供两种图标按钮样式，适用于不同场景：

**`.btn-icon`** - 32x32 有边框图标按钮

```vue
<button class="btn btn-icon" title="重置">
  <svg width="20" height="20">...</svg>
</button>
```

- 尺寸：32x32px
- 样式：有边框、有背景色
- 用途：通用设置、详情页等需要明显按钮的场景
- 图标建议尺寸：18-20px

**`.icon-btn`** - 28x28 透明背景图标按钮

```vue
<button class="icon-btn open-btn" title="打开">
  <svg width="14" height="14">...</svg>
</button>
```

- 尺寸：28x28px
- 样式：无边框、透明背景（悬浮时显示背景）
- 用途：列表操作、插件市场等紧凑场景
- 图标建议尺寸：14px
- 需要自定义颜色样式（如 `.open-btn`、`.download-btn`）

**2. 输入框 `.input`**

```vue
<input type="text" class="input" placeholder="请输入..." />
```

状态：

- 默认：中性色背景和边框
- 悬浮：`--hover-bg` 背景
- 聚焦：`--primary-color` 边框 + `--primary-light-bg` 背景

**3. 下拉框 `.select`**

```vue
<select class="select">
  <option value="1">选项1</option>
  <option value="2">选项2</option>
</select>
```

特性：自动适配亮色/暗色主题，悬浮和聚焦时显示主题色

**4. 开关 `.toggle`**

```vue
<label class="toggle">
  <input type="checkbox" v-model="enabled" />
  <span class="toggle-slider"></span>
</label>
```

特性：悬浮时 handle 会放大 1.15 倍，激活时显示主题色，平滑动画过渡

**5. 卡片 `.card`**

```vue
<div class="card">卡片内容</div>
<div class="card clickable">可点击的卡片</div>
```

修饰符：`.clickable` - 添加指针光标和点击效果

#### 开发步骤

**1. 优先使用通用类**

直接使用已定义的类，无需编写自定义样式：

```vue
<template>
  <button class="btn btn-primary">提交</button>
  <input type="text" class="input" placeholder="用户名" />
  <label class="toggle">
    <input type="checkbox" v-model="autoSave" />
    <span class="toggle-slider"></span>
  </label>
</template>
```

**2. 需要自定义时**

在组件内添加 scoped 样式：

```vue
<template>
  <button class="btn my-special-btn">特殊按钮</button>
</template>

<style scoped>
.my-special-btn {
  /* 在通用样式基础上添加自定义样式 */
  min-width: 120px;
}
</style>
```

**3. 扩展通用类**

如果新样式有通用性，添加到 `src/renderer/src/style.css`：

```css
/* 在 style.css 中添加 */
.btn-icon {
  padding: 8px;
  min-width: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

#### CSS 变量参考

**控件相关**：

- `--control-bg` - 控件默认背景色
- `--control-border` - 控件默认边框色
- `--hover-bg` - 悬浮时的背景色
- `--primary-light-bg` - 主题色浅背景（聚焦/激活状态）

**主题色**：

- `--primary-color` - 当前主题色（可动态切换）
- `--primary-hover` - 主题色悬浮态（自动计算）
- `--danger-color` / `--warning-color` / `--success-color` / `--purple-color`

**浅背景色**（用于按钮悬浮）：

- `--primary-light-bg` / `--danger-light-bg` / `--warning-light-bg` / `--success-light-bg` / `--purple-light-bg`

**文本和其他**：

- `--text-color` - 主要文本颜色
- `--text-secondary` - 次要文本颜色
- `--text-on-primary` - 主题色上的文本颜色（白色）
- `--card-bg` - 卡片背景色
- `--divider-color` - 分割线颜色

**重要提醒**：

- 不要在组件中重复定义控件样式，应该使用通用类
- 保持一致性，所有新增控件应遵循相同的视觉和交互模式
- 所有控件自动适配亮色/暗色主题
- 确保控件有清晰的悬浮、聚焦、禁用状态

### 开发无界面插件

无界面插件使用 **WebContentsView 加载空白页面** 方案实现，与 UI 插件共享相同的架构和 API。

#### 适用场景

- 后台定时任务（例如：番茄钟、提醒器）
- 数据处理和转换（例如：剪贴板增强、文本转换）
- 系统监控（例如：网络状态、电池监控）
- 纯命令行工具（例如：计算器、单位转换）

#### 快速开始

1. 创建 `plugin.json`（**不包含** `main` 字段）：

```json
{
  "name": "my-headless-plugin",
  "description": "我的后台插件",
  "features": [
    {
      "code": "main",
      "explain": "主功能",
      "cmds": ["触发词"]
    }
  ]
}
```

2. 创建入口脚本（支持 `index.js` 或 `dist/index.html` 等）：

```javascript
// 导出功能对象到 window.exports
window.exports = {
  main: {
    mode: 'none', // 'none' 表示无界面插件
    args: {
      // enter 方法会被主进程调用
      enter: async (action) => {
        console.log('无界面插件被调用:', action)

        // 执行后台任务
        window.ztools.showNotification('任务已完成')

        // 可以返回结果给主进程
        return { success: true, data: '处理完成' }
      }
    }
  }
}
```

#### 技术实现细节

- 判断 `plugin.json` 中没有 `main` 字段
- 创建 WebContentsView（和 UI 插件一样）
- 加载空白 HTML 页面（`file:///hideWindow.html`）
- 通过 `session.registerPreloadScript()` 注入 `resources/preload.js`
- 主进程通过 IPC `call-plugin-method` 调用插件的 `enter()` 方法
- 支持 Promise 返回结果（30秒超时）

#### 用户交互方式

由于没有 UI 界面，无界面插件通过以下方式与用户交互：

1. **系统通知**：使用 `window.ztools.showNotification()` 反馈结果
2. **剪贴板**：将结果写入剪贴板
3. **模拟按键**：使用 `sendInputEvent()` 模拟操作
4. **返回值**：通过 `return` 语句返回结果给主进程

#### 完整示例

```javascript
// 倒计时定时器插件
window.exports = {
  timer: {
    mode: 'none',
    args: {
      enter: async (action) => {
        const match = action.payload?.match(/(\d+)/)
        if (!match) {
          window.ztools.showNotification('❌ 请输入正确的时间格式，例如：timer 5')
          return { success: false, error: '参数错误' }
        }

        const minutes = parseInt(match[1])
        window.ztools.showNotification(`⏰ 定时器已启动：${minutes} 分钟`)

        setTimeout(
          () => {
            window.ztools.showNotification('⏰ 时间到！')
          },
          minutes * 60 * 1000
        )

        // 可选：保存到数据库
        const timers = (await window.ztools.db.get('active-timers')) || []
        timers.push({ minutes, startTime: Date.now() })
        await window.ztools.db.put({ _id: 'active-timers', data: timers })

        return { success: true, minutes }
      }
    }
  }
}
```

#### 生命周期

1. **加载**：用户首次触发插件时，系统创建 WebContentsView 并加载空白页面
2. **运行**：插件脚本执行，导出 `window.exports` 对象
3. **触发**：用户输入匹配时，主进程通过 IPC 调用 `enter()` 方法
4. **常驻**：WebContentsView 保持在缓存中，随时响应后续调用
5. **卸载**：应用关闭或手动终止插件时销毁视图

#### 性能考虑

- 每个无界面插件占用一个 WebContentsView（约 50-100MB 内存）
- 建议将频繁使用的功能写成无界面插件
- 偶尔使用的功能可以做成 UI 插件，用完即关

## 注意事项

### 类型安全

- 主进程和 preload 的类型检查是分开的（`pnpm typecheck:node`）
- 渲染进程类型检查（`pnpm typecheck:web`）
- `env.d.ts` 需要与 `preload/index.ts` 保持同步
- **禁止使用 `any` 类型**，优先使用具体类型或泛型

### UI 开发规范

- **优先使用通用控件类**（`.btn`、`.input`、`.select`、`.toggle`、`.card`、`.btn-icon`、`.icon-btn`）
- **图标按钮选择**：详情页/设置页用 `.btn-icon`（32x32），列表/紧凑场景用 `.icon-btn`（28x28）
- 不要在组件中重复定义控件样式
- 保持视觉和交互的一致性
- 所有控件自动适配亮色/暗色主题
- 使用简洁的语法（可选链操作符 `?.` 而非繁琐的 `if` 判断）

### 插件缓存管理

- UI 插件的 WebContentsView 都缓存在 `pluginViews` 数组
- 无界面插件同样使用 WebContentsView 缓存
- 长时间运行可能导致内存占用高（每个插件约 50-100MB）
- 考虑添加 LRU 清理策略或手动清理接口

### 跨平台支持

**已支持平台**：macOS、Windows

**原生模块架构**（`src/main/core/native/index.ts`）：

- 根据平台自动加载对应的原生模块：
  - macOS: `resources/lib/mac/ztools_native.node`
  - Windows: `resources/lib/win/ztools_native.node`
- 提供跨平台的统一接口：
  - `ClipboardMonitor` - 剪贴板监听（macOS ✅ / Windows ✅）
  - `WindowMonitor` - 窗口切换监听（macOS ✅ / Windows ✅）
  - `WindowManager` - 窗口管理和模拟粘贴（macOS ✅ / Windows ✅）
  - `ScreenCapture` - 区域截图（macOS ❌ / Windows ✅）

**指令扫描**（`src/main/core/commandScanner/`）：

- macOS: 扫描 `.app` 文件（通过 plist 获取元数据）
- Windows: 扫描 `.lnk` 快捷方式和开始菜单

**平台特定限制**：

- **macOS**：
  - 区域截图功能暂不支持
  - 窗口标识符：`bundleId` (string)
  - 系统设置功能暂不支持（仅 Windows）

- **Windows**：
  - 窗口标识符：`processId` (number)
  - 区域截图已支持
  - 系统设置功能已支持（38 个 ms-settings 指令）

- **Linux**：暂不支持（需要实现 `linuxScanner.ts` 和对应的原生模块）

**系统设置集成（Windows 专属）**：

- 通过 `window.ztools.isWindows()` 检测平台
- 仅在 Windows 平台加载 `WINDOWS_SETTINGS` 列表
- 使用 `shell.openExternal(ms-settings:xxx)` 启动
- 图标路径自动适配开发/打包环境
- 完全不影响 macOS 功能

### 数据库操作

- 所有数据库调用都应该包含错误处理
- 插件数据自动隔离（通过 `PLUGIN/{pluginName}/` 前缀）
- 插件删除时需要同步清理历史记录和固定列表（已实现，参考 `clear-plugin-data` IPC）
- 图片和剪贴板数据有容量限制，需要定期清理
- LMDB 文档和附件都有大小限制（文档 1MB，附件 10MB）
- 插件调用数据库 API 时，系统会自动识别调用来源并添加前缀（通过 `getPluginPrefix()` 方法）

### 搜索性能

- `getCommands()` 每次都扫描系统指令，考虑缓存 + 增量更新
- Fuse.js 搜索阈值设置为 0
- 正则匹配需要检查 `minLength`，避免短查询性能问题

## 架构设计原则

1. **职责分离**：主进程负责系统交互，渲染进程负责 UI，preload 负责安全隔离
2. **数据单向流动**：Store → Component，通过事件或 action 修改 Store
3. **插件隔离**：
   - UI 通过 WebContentsView 隔离
   - 数据通过命名空间前缀隔离（`PLUGIN/{pluginName}/`）
   - API 通过 preload 脚本限制访问权限
4. **性能优先**：
   - 搜索结果缓存在 Store
   - 插件 WebContentsView 复用
   - LMDB 提供高性能键值存储（比 PouchDB 快 3-5 倍）
5. **容错设计**：IPC 调用、数据库操作、插件加载都应该有错误处理

## 重要技术决策

### 为什么采用"万物皆指令"设计？

- **统一性**：应用、系统设置、插件功能统一为 `Command` 类型，简化代码逻辑
- **可扩展性**：通过 `type` 和 `subType` 轻松添加新的指令来源
- **用户体验**：用户无需区分"这是应用还是功能"，搜索即可
- **类型安全**：TypeScript 类型系统提供完整的类型检查
- **向后兼容**：不影响现有插件功能，平滑迁移

### 为什么从 PouchDB 迁移到 LMDB？

- **性能**：LMDB 读写速度比 PouchDB 快 3-5 倍，内存占用降低 60%
- **简单性**：不需要云同步功能，本地键值存储足够
- **稳定性**：LMDB 是经过验证的嵌入式数据库（被 OpenLDAP 等项目使用）
- **API 兼容性**：保留了 UTools 风格的 API，插件迁移成本低

### 为什么支持无界面插件？

- **资源效率**：不需要 UI 的功能（如定时器、剪贴板监听）不应该占用渲染资源
- **开发体验**：复用完整的插件 API，开发者无需学习新接口
- **灵活性**：插件可以轻松在 UI 和无界面之间切换

### 为什么模块化 API？

- **可维护性**：按功能分类比单一文件更清晰（原来超过 1000 行）
- **权限隔离**：清晰区分主程序和插件可用的 API
- **扩展性**：新增功能只需添加新模块，不影响现有代码

### 为什么使用 WebContentsView？

- **统一架构**：UI 插件和无界面插件使用相同的容器机制
- **资源管理**：更好的生命周期控制和内存管理
- **官方推荐**：Electron 38+ 推荐使用 WebContentsView 替代 BrowserView

### 为什么使用 ZPX 格式替代 ZIP？

- **完整性**：asar 归档保留完整的目录结构和元数据，比 ZIP 更可靠
- **兼容性**：asar 是 Electron 原生支持的归档格式，与 Electron 生态一致
- **性能**：gzip 流式压缩/解压，内存占用更低，适合大型插件
- **安全性**：避免 ZIP 路径穿越等安全漏洞，asar 格式天然安全
- **格式**：`.zpx = gzip(asar archive)`，Magic bytes: `0x1f 0x8b`
