import { platform } from '@electron-toolkit/utils'
import { app, BrowserWindow, session } from 'electron'
import log from 'electron-log'
import path from 'path'
import api from './api/index'
import appWatcher from './appWatcher'
import detachedWindowManager from './core/detachedWindowManager'
import floatingBallManager from './core/floatingBallManager'
import httpServer from './core/httpServer'
import mcpServer from './core/mcpServer'
import { registerIconProtocolForSession, registerIconScheme } from './core/iconProtocol'
import { loadInternalPlugins } from './core/internalPluginLoader'
import { startInternalPluginServer } from './core/internalPluginServer'
import pluginManager from './managers/pluginManager'
import windowManager from './managers/windowManager'

// Windows 平台需要设置 AppUserModelId 才能让单例锁正常工作
if (process.platform === 'win32') {
  app.setAppUserModelId('link.eiot.ztools')
}

// 单例锁
const gotTheLock = app.requestSingleInstanceLock()

// 待打开的 .zpx 文件路径（在 app.ready 之前收到的文件打开事件）
let pendingZpxFile: string | null = null

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // 当运行第二个实例时，焦点聚焦到这个实例
    windowManager.showWindow()

    // Windows: 检查命令行参数中是否有 .zpx 文件路径
    const zpxPath = argv.find((arg) => arg.endsWith('.zpx'))
    if (zpxPath) {
      console.log('[Main] 第二实例传入 ZPX 文件:', zpxPath)
      windowManager.openPluginInstaller(zpxPath)
    }
  })
}

// macOS: 监听文件打开事件（双击 .zpx 文件或拖拽到 Dock 图标）
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!filePath.endsWith('.zpx')) return

  console.log('[Main] 收到 open-file 事件:', filePath)

  if (app.isReady()) {
    // 应用已就绪，直接打开安装页面
    windowManager.openPluginInstaller(filePath)
  } else {
    // 应用还未就绪，暂存路径等 ready 后处理
    pendingZpxFile = filePath
  }
})

// ========== 注册自定义协议为特权协议（必须在 app.ready 之前调用）==========
registerIconScheme()

// 配置 electron-log
log.transports.file.level = 'debug'
log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB
log.transports.file.resolvePathFn = () => {
  return path.join(app.getPath('userData'), 'logs/main.log')
}
log.transports.console.level = 'debug'

// 生产环境接管 console
// if (process.env.NODE_ENV === 'production') {
Object.assign(console, log.functions)
// }

// 安装日志收集器 hook（用于设置插件的调试控制台）
import logCollector from './core/logCollector.js'
logCollector.install()

// 开发模式下禁用某些警告
if (process.env.NODE_ENV !== 'production') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

// 添加 Chromium 命令行开关，禁用跨域限制
// app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
// app.commandLine.appendSwitch('disable-site-isolation-trials')
// app.commandLine.appendSwitch('disable-web-security')

// 导出函数供 API 使用
export function updateShortcut(shortcut: string): boolean {
  return windowManager.registerShortcut(shortcut)
}

export function getCurrentShortcut(): string {
  return windowManager.getCurrentShortcut()
}

app.whenReady().then(async () => {
  // 注册自定义图标协议到默认 session (ztools-icon://)
  registerIconProtocolForSession(session.defaultSession)

  // 启动内置插件本地 HTTP server（仅生产环境，解决 file:// 下的 CSP 限制）
  await startInternalPluginServer()

  // ✅ 首先加载内置插件
  loadInternalPlugins()

  // 隐藏 Dock 图标（仅在没有分离窗口时隐藏）
  if (platform.isMacOS) {
    if (!detachedWindowManager.hasDetachedWindows()) {
      app.dock?.hide()
    }
  }

  // 创建主窗口
  const mainWindow = windowManager.createWindow()

  // 初始化 API 和插件管理器
  if (mainWindow) {
    api.init(mainWindow, pluginManager)
    pluginManager.init(mainWindow)
    // 初始化应用目录监听器
    appWatcher.init(mainWindow)
  }

  // 注册全局快捷键
  windowManager.registerShortcut()

  // 初始化悬浮球（从配置决定是否显示）
  floatingBallManager.init()

  // 自动启动已配置的"跟随主程序同时启动运行"的插件
  if (mainWindow) {
    try {
      const autoStartPlugins = api.dbGet('autoStartPlugin')
      if (autoStartPlugins && Array.isArray(autoStartPlugins) && autoStartPlugins.length > 0) {
        const plugins = api.dbGet('plugins')
        if (plugins && Array.isArray(plugins)) {
          for (const pluginName of autoStartPlugins) {
            const plugin = plugins.find((p: any) => p.name === pluginName)
            if (plugin?.path) {
              console.log('[Main] 自动启动插件:', pluginName)
              pluginManager.preloadPlugin(plugin.path).catch((error) => {
                console.error('[Main] 自动启动插件失败:', pluginName, error)
              })
            }
          }
        }
      }
    } catch (error) {
      console.error('[Main] 读取自动启动插件配置失败:', error)
    }
  }

  // 处理文件关联打开：macOS pending 文件 / Windows 命令行参数
  const zpxFromArgs =
    pendingZpxFile || process.argv.find((arg) => arg.endsWith('.zpx') && !arg.startsWith('-'))
  if (zpxFromArgs) {
    pendingZpxFile = null
    // 等待窗口和插件系统完全初始化后再打开
    setTimeout(() => {
      console.log('[Main] 处理启动时的 ZPX 文件:', zpxFromArgs)
      windowManager.openPluginInstaller(zpxFromArgs)
    }, 1500)
  }
})

app.on('window-all-closed', () => {
  if (!platform.isMacOS) {
    app.quit()
  }
})

app.on('will-quit', () => {
  windowManager.unregisterAllShortcuts()
  // 停止应用目录监听
  appWatcher.stop()
  // 清理悬浮球
  floatingBallManager.cleanup()
  // 关闭 HTTP 服务器
  httpServer.stop()
  mcpServer.stop()
})

app.on('before-quit', (event) => {
  // 检查是否是通过托盘菜单主动退出
  if (!windowManager.getQuitting()) {
    // 不是主动退出（如 Command+Q），阻止退出
    event.preventDefault()
    console.log('[Main] 阻止了 Command+Q 退出，请使用托盘菜单退出')
    // 隐藏窗口
    windowManager.hideWindow(false)
  } else {
    // 主动退出时，关闭所有插件
    pluginManager.killAllPlugins()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createWindow()
  }
})

// 开发模式下监听 Ctrl+C 信号
if (process.env.NODE_ENV !== 'production') {
  process.on('SIGINT', () => {
    console.log('[Main] 收到 SIGINT 信号，退出应用')
    app.quit()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('[Main] 收到 SIGTERM 信号，退出应用')
    app.quit()
    process.exit(0)
  })
}
