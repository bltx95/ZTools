const electron = require('electron')

// 为已弃用的 ipcRenderer.sendTo 添加 polyfill
// 通过主进程转发消息到目标 webContents
if (!electron.ipcRenderer.sendTo) {
  electron.ipcRenderer.sendTo = function (webContentsId, channel, ...args) {
    electron.ipcRenderer.send('ipc-send-to', webContentsId, channel, ...args)
  }
}

// 事件监听采用单回调模式：重复注册会替换之前的回调，避免插件热重载时累积多个监听器
let enterCallback = null
// 进入事件粘性缓存：解决 onPluginEnter 晚绑定导致的事件丢失
let pendingEnterPayload = null
let pendingEnterMeta = null
let clipboardChangeCallback = null
let subInputChangeCallback = null
let pluginOutCallback = null
let pluginDetachCallback = null
let mainPushCallback = null // { callback, selectCallback }
let hotkeyRecordedCallback = null
let windowMaterialChangeCallback = null
let logEntriesCallback = null
let foundInPageCallback = null

/**
 * 统一派发插件进入事件（已注册回调时调用）
 */
function dispatchPluginEnter(launchParam) {
  if (!enterCallback) return
  console.log('[PluginRuntime][Enter] dispatch-now', {
    assemblyId: launchParam?.__assemblyId,
    ts: launchParam?.__ts
  })
  enterCallback(launchParam)
}

/**
 * 回放缓存的进入事件（仅保留最新一条）
 */
function replayPendingPluginEnterIfNeeded() {
  if (!enterCallback || !pendingEnterPayload) return
  const replayPayload = pendingEnterPayload
  const replayMeta = pendingEnterMeta
  // 清空后再异步回放，避免重复触发
  pendingEnterPayload = null
  pendingEnterMeta = null
  console.log('[PluginRuntime][Enter] replay-pending', replayMeta || {})
  queueMicrotask(() => {
    dispatchPluginEnter(replayPayload)
  })
}

// 获取操作系统类型
const osType = electron.ipcRenderer.sendSync('get-os-type')

// Sharp 图像处理库（懒加载，仅在首次调用时加载）
let _sharp = null
function getSharp() {
  if (!_sharp) {
    try {
      _sharp = require('sharp')
    } catch (err) {
      console.error('[ZTools] Sharp 加载失败:', err.message)
      throw new Error('Sharp 图像处理库加载失败，请确保已正确安装')
    }
  }
  return _sharp
}

window.ztools = {
  getAppName: () => 'ZTools',
  // 获取拖放文件的路径（Electron webUtils）
  getPathForFile: (file) => electron.webUtils.getPathForFile(file),
  // 平台检测
  isMacOs: () => osType === 'Darwin',
  isMacOS: () => osType === 'Darwin',
  isWindows: () => osType === 'Windows_NT',
  isLinux: () => osType === 'Linux',
  // 获取设备唯一标识符（32位字符串）
  getNativeId: () => electron.ipcRenderer.sendSync('get-native-id'),
  // 获取应用版本号
  getAppVersion: () => electron.ipcRenderer.sendSync('get-app-version'),
  // 获取窗口类型
  getWindowType: () => electron.ipcRenderer.sendSync('get-window-type'),
  // 是否深色主题
  isDarkColors: () => electron.ipcRenderer.sendSync('is-dark-colors'),
  sendInputEvent: async (event) => await electron.ipcRenderer.invoke('send-input-event', event),
  // 在当前页面中查找文本
  findInPage: (text, options) => electron.ipcRenderer.invoke('find-in-page', text, options),
  // 停止查找
  stopFindInPage: (action = 'clearSelection') =>
    electron.ipcRenderer.invoke('stop-find-in-page', action),
  // 监听页面查找结果
  onFindInPageResult: (callback) => {
    if (callback && typeof callback === 'function') {
      foundInPageCallback = callback
    }
  },
  // 取消监听页面查找结果
  offFindInPageResult: (callback) => {
    if (foundInPageCallback === callback) foundInPageCallback = null
  },
  // 模拟键盘按键
  simulateKeyboardTap: (key, ...modifiers) => {
    console.log('插件请求模拟键盘按键:', { key, modifiers })
    return electron.ipcRenderer.sendSync('simulate-keyboard-tap', key, modifiers)
  },
  onPluginEnter: async (callback) => {
    console.log('插件请求onPluginEnter')
    enterCallback = callback
    console.log('[PluginRuntime][Enter] enter-handler-registered')
    replayPendingPluginEnterIfNeeded()
  },
  // 插件退出事件
  onPluginOut: async (callback) => {
    console.log('插件请求onPluginOut')
    if (callback && typeof callback === 'function') {
      pluginOutCallback = callback
    }
  },
  // 插件分离事件
  onPluginDetach: async (callback) => {
    console.log('插件请求onPluginDetach')
    if (callback && typeof callback === 'function') {
      pluginDetachCallback = callback
    }
  },
  // 监听主搜索推送（mainPush 功能）
  onMainPush: (callback, selectCallback) => {
    console.log('插件注册 onMainPush')
    if (callback && typeof callback === 'function') {
      mainPushCallback = { callback, selectCallback }
    }
  },
  // 兼容旧api
  onPluginReady: async (callback) => {
    console.log('插件请求onPluginReady')
    enterCallback = callback
    console.log('[PluginRuntime][Enter] enter-handler-registered(by-ready)')
    replayPendingPluginEnterIfNeeded()
  },
  // 显示系统通知
  showNotification: async (body) => {
    return await electron.ipcRenderer.invoke('show-notification', body)
  },
  // 显示 toast 提示
  showToast: async (options) => {
    // 如果是字符串,转换为对象
    const toastOptions = typeof options === 'string' ? { message: options } : options
    return await electron.ipcRenderer.invoke('plugin:show-toast', toastOptions)
  },
  // 设置插件高度
  setExpendHeight: async (height) => {
    return await electron.ipcRenderer.invoke('set-expend-height', height)
  },
  // 设置子输入框 (插件模式下的搜索框)
  setSubInput: async (onChange, placeholder, isFocus = true) => {
    console.log('插件设置子输入框:', { placeholder, isFocus })
    // 保存回调（替换之前的）
    if (onChange && typeof onChange === 'function') {
      subInputChangeCallback = onChange
    }
    // 通知主进程更新 placeholder，并传递 isFocus 参数
    return await electron.ipcRenderer.invoke('set-sub-input', placeholder, isFocus)
  },
  // 移除子输入框（隐藏）
  removeSubInput: async () => {
    console.log('插件移除子输入框')
    subInputChangeCallback = null
    return await electron.ipcRenderer.invoke('remove-sub-input')
  },
  // 设置子输入框的值
  setSubInputValue: async (text) => {
    console.log('插件设置子输入框值:', text)
    return await electron.ipcRenderer.invoke('set-sub-input-value', text)
  },
  // 聚焦子输入框
  subInputFocus: () => {
    console.log('插件请求聚焦子输入框')
    return electron.ipcRenderer.sendSync('sub-input-focus')
  },
  // 子输入框失去焦点，插件应用获得焦点
  subInputBlur: () => {
    console.log('插件请求子输入框失去焦点')
    return electron.ipcRenderer.sendSync('sub-input-blur')
  },
  // 子输入框获得焦点并选中内容
  subInputSelect: () => {
    console.log('插件请求选中子输入框内容')
    return electron.ipcRenderer.sendSync('sub-input-select')
  },
  // 标准数据库 API - 完全兼容 UTools
  // 同步版本（供插件使用）
  db: {
    put: (doc) => electron.ipcRenderer.sendSync('db:put', doc),
    get: (id) => electron.ipcRenderer.sendSync('db:get', id),
    remove: (docOrId) => electron.ipcRenderer.sendSync('db:remove', docOrId),
    bulkDocs: (docs) => electron.ipcRenderer.sendSync('db:bulk-docs', docs),
    allDocs: (key) => electron.ipcRenderer.sendSync('db:all-docs', key),
    postAttachment: (id, attachment, type) =>
      electron.ipcRenderer.sendSync('db:post-attachment', id, attachment, type),
    getAttachment: (id) => electron.ipcRenderer.sendSync('db:get-attachment', id),
    getAttachmentType: (id) => electron.ipcRenderer.sendSync('db:get-attachment-type', id),

    // Promise API（供渲染进程使用）
    promises: {
      put: async (doc) => await electron.ipcRenderer.invoke('db:put', doc),
      get: async (id) => await electron.ipcRenderer.invoke('db:get', id),
      remove: async (docOrId) => await electron.ipcRenderer.invoke('db:remove', docOrId),
      bulkDocs: async (docs) => await electron.ipcRenderer.invoke('db:bulk-docs', docs),
      allDocs: async (key) => await electron.ipcRenderer.invoke('db:all-docs', key),
      postAttachment: async (id, attachment, type) =>
        await electron.ipcRenderer.invoke('db:post-attachment', id, attachment, type),
      getAttachment: async (id) => await electron.ipcRenderer.invoke('db:get-attachment', id),
      getAttachmentType: async (id) =>
        await electron.ipcRenderer.invoke('db:get-attachment-type', id)
    }
  },

  // dbStorage API - 类似 localStorage 的简化接口
  dbStorage: {
    setItem: (key, value) => electron.ipcRenderer.sendSync('db-storage:set-item', key, value),
    getItem: (key) => electron.ipcRenderer.sendSync('db-storage:get-item', key),
    removeItem: (key) => electron.ipcRenderer.sendSync('db-storage:remove-item', key)
  },

  // 动态 Feature API
  // 获取动态添加的 features（可选参数：指定要获取的 feature codes）
  getFeatures: (codes) => electron.ipcRenderer.sendSync('get-features', codes),
  // 设置动态 feature（如果已存在则更新）
  setFeature: (feature) => electron.ipcRenderer.sendSync('set-feature', feature),
  // 删除指定的动态 feature
  removeFeature: (code) => electron.ipcRenderer.sendSync('remove-feature', code),

  // 剪贴板相关API
  clipboard: {
    getHistory: async (page, pageSize, filter) =>
      await electron.ipcRenderer.invoke('clipboard:get-history', page, pageSize, filter),
    search: async (keyword) => await electron.ipcRenderer.invoke('clipboard:search', keyword),
    delete: async (id) => await electron.ipcRenderer.invoke('clipboard:delete', id),
    clear: async (type) => await electron.ipcRenderer.invoke('clipboard:clear', type),
    getStatus: async () => await electron.ipcRenderer.invoke('clipboard:get-status'),
    write: async (id, shouldPaste = true) =>
      await electron.ipcRenderer.invoke('clipboard:write', id, shouldPaste),
    // 写入内容到剪贴板 ({ type: 'text'|'image', content: string }, shouldPaste = true)
    writeContent: async (data, shouldPaste = true) =>
      await electron.ipcRenderer.invoke('clipboard:write-content', data, shouldPaste),
    updateConfig: async (config) =>
      await electron.ipcRenderer.invoke('clipboard:update-config', config),
    // 监听剪贴板变化事件
    onChange: async (callback) => {
      clipboardChangeCallback = callback
    }
  },
  // 复制文本到剪贴板
  copyText: (text) => electron.ipcRenderer.sendSync('copy-text', text),
  // 复制图片到剪贴板
  copyImage: (image) => electron.ipcRenderer.sendSync('copy-image', image),
  // 复制文件到剪贴板
  copyFile: (filePath) => electron.ipcRenderer.sendSync('copy-file', filePath),
  // 获取系统路径
  getPath: (name) => electron.ipcRenderer.sendSync('get-path', name),
  // 显示文件保存对话框
  // 显示文件保存对话框
  showSaveDialog: (options) => electron.ipcRenderer.sendSync('show-save-dialog', options),
  // 显示文件打开对话框
  showOpenDialog: (options) => electron.ipcRenderer.sendSync('show-open-dialog', options),
  // 屏幕截图
  screenCapture: async (callback) => {
    const image = await electron.ipcRenderer.invoke('screen-capture')
    if (callback && typeof callback === 'function') {
      callback(image)
    }
  },
  // 显示主窗口
  showMainWindow: async () => {
    return await electron.ipcRenderer.invoke('show-main-window')
  },
  // 隐藏主窗口
  hideMainWindow: async (isRestorePreWindow = true) => {
    return await electron.ipcRenderer.invoke('hide-main-window', isRestorePreWindow)
  },
  // 创建独立窗口
  createBrowserWindow: (url, options, callback) => {
    const callbackId = Math.random().toString(36).substr(2, 9)

    // 监听加载完成事件
    if (callback && typeof callback === 'function') {
      electron.ipcRenderer.once(`browser-window-loaded-${callbackId}`, () => {
        callback()
      })
    }

    // 同步调用创建窗口，获取 windowId
    const windowId = electron.ipcRenderer.sendSync(
      'create-browser-window',
      url,
      options,
      callbackId
    )

    if (!windowId) return null

    // 创建 Proxy 对象模拟 BrowserWindow
    const createProxy = (path = []) => {
      return new Proxy(() => {}, {
        get: (target, prop) => {
          if (typeof prop !== 'string') return undefined

          // 特殊处理 then，防止 Promise 链式调用错误
          if (prop === 'then') {
            if (path.length === 0) return undefined
            // 如果用户强行 await 一个属性，我们返回该属性的值
            return (resolve) =>
              resolve(
                electron.ipcRenderer.sendSync('browser-window-get-prop-sync', windowId, path).value
              )
          }

          const newPath = [...path, prop]

          // 同步获取属性信息
          const info = electron.ipcRenderer.sendSync(
            'browser-window-get-prop-sync',
            windowId,
            newPath
          )

          console.log('获取属性信息:', info)

          if (info.type === 'value') {
            return info.value
          } else if (info.type === 'undefined') {
            throw new Error('window no exist')
          } else {
            // 如果是对象，继续 Proxy
            return createProxy(newPath)
          }
        },
        apply: (target, thisArg, args) => {
          // 同步尝试调用方法
          const result = electron.ipcRenderer.sendSync(
            'browser-window-call-sync',
            windowId,
            path,
            args
          )

          if (result.type === 'value') {
            // 同步方法，直接返回结果
            return result.data
          } else if (result.type === 'promise') {
            // 异步方法，返回 Promise 等待结果
            return electron.ipcRenderer.invoke('browser-window-wait-task', result.taskId)
          }

          return null
        }
      })
    }

    return createProxy()
  },
  // 退出插件
  outPlugin: async (isKill = false) => {
    return await electron.ipcRenderer.invoke('out-plugin', isKill)
  },
  // 发送消息到父窗口
  sendToParent: (channel, ...args) => {
    electron.ipcRenderer.send('send-to-parent', channel, ...args)
  },
  // 获取主显示器信息
  getPrimaryDisplay: () => electron.ipcRenderer.sendSync('get-primary-display'),
  // 获取所有显示器
  getAllDisplays: () => electron.ipcRenderer.sendSync('get-all-displays'),
  // 获取鼠标光标的屏幕坐标
  getCursorScreenPoint: () => electron.ipcRenderer.sendSync('get-cursor-screen-point'),
  // 获取最接近指定点的显示器
  getDisplayNearestPoint: (point) =>
    electron.ipcRenderer.sendSync('get-display-nearest-point', point),
  // 获取桌面捕获源
  desktopCaptureSources: async (options) =>
    await electron.ipcRenderer.invoke('desktop-capture-sources', options),
  // DIP 坐标转屏幕物理坐标
  dipToScreenPoint: (point) => electron.ipcRenderer.sendSync('dip-to-screen-point', point),
  // 屏幕物理坐标转 DIP 坐标
  screenToDipPoint: (point) => electron.ipcRenderer.sendSync('screen-to-dip-point', point),
  // DIP 区域转屏幕物理区域
  dipToScreenRect: (rect) => electron.ipcRenderer.sendSync('dip-to-screen-rect', rect),
  // 检查当前插件是否处于开发模式
  isDev: () => electron.ipcRenderer.sendSync('is-dev'),
  // 获取当前 WebContents ID
  getWebContentsId: () => electron.ipcRenderer.sendSync('get-web-contents-id'),
  // 使用系统默认程序打开 URL
  shellOpenExternal: (url) => electron.ipcRenderer.sendSync('shell-open-external', url),
  // 使用系统默认方式打开文件或文件夹
  shellOpenPath: (fullPath) => electron.ipcRenderer.sendSync('shell-open-path', fullPath),
  // 在文件管理器中显示文件
  shellShowItemInFolder: (fullPath) =>
    electron.ipcRenderer.sendSync('shell-show-item-in-folder', fullPath),
  // 获取文件系统图标（返回 base64 Data URL）
  getFileIcon: (filePath) => electron.ipcRenderer.sendSync('get-file-icon', filePath),
  // 插件跳转
  redirect: (label, payload) =>
    electron.ipcRenderer.sendSync('ztools-redirect', { label, payload }),
  // HTTP 请求头设置
  http: {
    // 设置请求头
    setHeaders: (headers) => electron.ipcRenderer.sendSync('http-set-headers', headers),
    // 获取当前请求头配置
    getHeaders: () => electron.ipcRenderer.sendSync('http-get-headers'),
    // 清除请求头配置
    clearHeaders: () => electron.ipcRenderer.sendSync('http-clear-headers')
  },

  // AI 调用 API
  ai: (option, streamCallback) => {
    const requestId = Math.random().toString(36).substr(2, 9)

    // 创建 PromiseLike 对象
    const promiseLike = {
      abort: () => {
        electron.ipcRenderer.invoke('plugin:ai-abort', requestId)
      }
    }

    if (streamCallback && typeof streamCallback === 'function') {
      // 流式调用
      const streamListener = (event, chunk) => {
        streamCallback(chunk)
      }

      // 监听流式数据
      electron.ipcRenderer.on(`plugin:ai-stream-${requestId}`, streamListener)

      // 创建 Promise
      const promise = electron.ipcRenderer
        .invoke('plugin:ai-call-stream', requestId, option)
        .then((result) => {
          // 移除监听器
          electron.ipcRenderer.removeListener(`plugin:ai-stream-${requestId}`, streamListener)
          if (!result.success) {
            throw new Error(result.error || 'AI 调用失败')
          }
        })
        .catch((error) => {
          // 移除监听器
          electron.ipcRenderer.removeListener(`plugin:ai-stream-${requestId}`, streamListener)
          throw error
        })

      // 合并 Promise 和 abort 方法
      Object.setPrototypeOf(promiseLike, promise)
      promiseLike.then = promise.then.bind(promise)
      promiseLike.catch = promise.catch.bind(promise)
      promiseLike.finally = promise.finally.bind(promise)

      return promiseLike
    } else {
      // 非流式调用
      const promise = electron.ipcRenderer
        .invoke('plugin:ai-call', requestId, option)
        .then((result) => {
          if (!result.success) {
            throw new Error(result.error || 'AI 调用失败')
          }
          return result.data
        })

      // 合并 Promise 和 abort 方法
      Object.setPrototypeOf(promiseLike, promise)
      promiseLike.then = promise.then.bind(promise)
      promiseLike.catch = promise.catch.bind(promise)
      promiseLike.finally = promise.finally.bind(promise)

      return promiseLike
    }
  },

  // 获取所有可用 AI 模型
  allAiModels: async () => {
    const result = await electron.ipcRenderer.invoke('plugin:ai-all-models')
    if (!result.success) {
      throw new Error(result.error || '获取 AI 模型列表失败')
    }
    return result.data || []
  },

  // 内置插件专用 API（仅限内置插件调用）
  internal: {
    // ==================== 数据库 API (ZTOOLS/ 命名空间) ====================
    dbPut: async (key, value) => await electron.ipcRenderer.invoke('internal:db-put', key, value),
    dbGet: async (key) => await electron.ipcRenderer.invoke('internal:db-get', key),

    // ==================== 应用启动 API ====================
    launch: async (params) => await electron.ipcRenderer.invoke('internal:launch', params),
    quitApp: async () => await electron.ipcRenderer.invoke('internal:quit-app'),

    // ==================== 指令管理 API ====================
    getCommands: async () => await electron.ipcRenderer.invoke('internal:get-commands'),

    // ==================== 本地启动管理 API ====================
    localShortcuts: {
      getAll: async () => await electron.ipcRenderer.invoke('local-shortcuts:get-all'),
      add: async (type) => await electron.ipcRenderer.invoke('local-shortcuts:add', type),
      addByPath: async (filePath) =>
        await electron.ipcRenderer.invoke('local-shortcuts:add-by-path', filePath),
      delete: async (id) => await electron.ipcRenderer.invoke('local-shortcuts:delete', id),
      open: async (path) => await electron.ipcRenderer.invoke('local-shortcuts:open', path),
      updateAlias: async (id, alias) =>
        await electron.ipcRenderer.invoke('local-shortcuts:update-alias', id, alias)
    },

    // ==================== 插件管理 API ====================
    getPlugins: async () => await electron.ipcRenderer.invoke('internal:get-plugins'),
    getAllPlugins: async () => await electron.ipcRenderer.invoke('internal:get-all-plugins'),
    selectPluginFile: async () => await electron.ipcRenderer.invoke('internal:select-plugin-file'),
    importPlugin: async () => await electron.ipcRenderer.invoke('internal:import-plugin'),
    readPluginInfoFromZpx: async (zpxPath) =>
      await electron.ipcRenderer.invoke('internal:read-plugin-info-from-zpx', zpxPath),
    installPluginFromPath: async (zpxPath) =>
      await electron.ipcRenderer.invoke('internal:install-plugin-from-path', zpxPath),
    importDevPlugin: async (pluginPath) =>
      await electron.ipcRenderer.invoke('internal:import-dev-plugin', pluginPath),
    deletePlugin: async (pluginPath) =>
      await electron.ipcRenderer.invoke('internal:delete-plugin', pluginPath),
    reloadPlugin: async (pluginPath) =>
      await electron.ipcRenderer.invoke('internal:reload-plugin', pluginPath),
    getRunningPlugins: async () =>
      await electron.ipcRenderer.invoke('internal:get-running-plugins'),
    killPlugin: async (pluginPath) =>
      await electron.ipcRenderer.invoke('internal:kill-plugin', pluginPath),
    fetchPluginMarket: async () =>
      await electron.ipcRenderer.invoke('internal:fetch-plugin-market'),
    installPluginFromMarket: async (plugin) =>
      await electron.ipcRenderer.invoke('internal:install-plugin-from-market', plugin),
    installPluginFromNpm: async (options) =>
      await electron.ipcRenderer.invoke('internal:install-plugin-from-npm', options),
    getPluginReadme: async (pluginPathOrName, pluginName) =>
      await electron.ipcRenderer.invoke('internal:get-plugin-readme', pluginPathOrName, pluginName),
    getPluginDocKeys: async (pluginPath) =>
      await electron.ipcRenderer.invoke('internal:get-plugin-doc-keys', pluginPath),
    getPluginDoc: async (pluginPath, docKey) =>
      await electron.ipcRenderer.invoke('internal:get-plugin-doc', pluginPath, docKey),
    getPluginDataStats: async () =>
      await electron.ipcRenderer.invoke('internal:get-plugin-data-stats'),
    clearPluginData: async (pluginName) =>
      await electron.ipcRenderer.invoke('internal:clear-plugin-data', pluginName),
    packagePlugin: async (pluginPath) =>
      await electron.ipcRenderer.invoke('internal:package-plugin', pluginPath),
    getPluginMemoryInfo: async (pluginPath) =>
      await electron.ipcRenderer.invoke('internal:get-plugin-memory-info', pluginPath),

    // ==================== 全局快捷键 API ====================
    registerGlobalShortcut: async (shortcut, target) =>
      await electron.ipcRenderer.invoke('internal:register-global-shortcut', shortcut, target),
    unregisterGlobalShortcut: async (shortcut) =>
      await electron.ipcRenderer.invoke('internal:unregister-global-shortcut', shortcut),
    startHotkeyRecording: async () =>
      await electron.ipcRenderer.invoke('internal:start-hotkey-recording'),
    updateShortcut: async (shortcut) =>
      await electron.ipcRenderer.invoke('internal:update-shortcut', shortcut),
    getCurrentShortcut: async () => await electron.ipcRenderer.invoke('get-current-shortcut'),
    onHotkeyRecorded: (callback) => {
      if (callback && typeof callback === 'function') {
        hotkeyRecordedCallback = callback
      }
    },

    // ==================== 应用快捷键 API ====================
    registerAppShortcut: async (shortcut, target) =>
      await electron.ipcRenderer.invoke('internal:register-app-shortcut', shortcut, target),
    unregisterAppShortcut: async (shortcut) =>
      await electron.ipcRenderer.invoke('internal:unregister-app-shortcut', shortcut),

    // ==================== 系统设置 API ====================
    setWindowOpacity: async (opacity) =>
      await electron.ipcRenderer.invoke('internal:set-window-opacity', opacity),
    setWindowDefaultHeight: async (height) =>
      await electron.ipcRenderer.invoke('internal:set-window-default-height', height),
    setWindowMaterial: async (material) =>
      await electron.ipcRenderer.invoke('internal:set-window-material', material),
    getWindowMaterial: async () =>
      await electron.ipcRenderer.invoke('internal:get-window-material'),
    selectAvatar: async () => await electron.ipcRenderer.invoke('internal:select-avatar'),
    setTheme: async (theme) => await electron.ipcRenderer.invoke('internal:set-theme', theme),
    setTrayIconVisible: async (visible) =>
      await electron.ipcRenderer.invoke('internal:set-tray-icon-visible', visible),
    setLaunchAtLogin: async (enabled) =>
      await electron.ipcRenderer.invoke('internal:set-launch-at-login', enabled),
    getLaunchAtLogin: async () => await electron.ipcRenderer.invoke('internal:get-launch-at-login'),
    setProxyConfig: async (config) =>
      await electron.ipcRenderer.invoke('internal:set-proxy-config', config),
    getAppVersion: async () => await electron.ipcRenderer.invoke('get-app-version'),
    getSystemVersions: async () => await electron.ipcRenderer.invoke('get-system-versions'),
    getPlatform: () => electron.ipcRenderer.sendSync('internal:get-platform'),

    // 通知主渲染进程更新搜索框提示文字
    updatePlaceholder: async (placeholder) =>
      await electron.ipcRenderer.invoke('internal:update-placeholder', placeholder),
    // 通知主渲染进程更新头像
    updateAvatar: async (avatar) =>
      await electron.ipcRenderer.invoke('internal:update-avatar', avatar),
    // 通知主渲染进程更新自动粘贴配置
    updateAutoPaste: async (autoPaste) =>
      await electron.ipcRenderer.invoke('internal:update-auto-paste', autoPaste),
    // 通知主渲染进程更新自动清空配置
    updateAutoClear: async (autoClear) =>
      await electron.ipcRenderer.invoke('internal:update-auto-clear', autoClear),
    // 通知主渲染进程更新自动返回搜索配置
    updateAutoBackToSearch: async (autoBackToSearch) =>
      await electron.ipcRenderer.invoke('internal:update-auto-back-to-search', autoBackToSearch),
    // 通知主渲染进程更新显示最近使用配置
    updateShowRecentInSearch: async (showRecentInSearch) =>
      await electron.ipcRenderer.invoke(
        'internal:update-show-recent-in-search',
        showRecentInSearch
      ),
    // 通知主渲染进程更新最近使用行数
    updateRecentRows: async (rows) =>
      await electron.ipcRenderer.invoke('internal:update-recent-rows', rows),
    // 通知主渲染进程更新固定栏行数
    updatePinnedRows: async (rows) =>
      await electron.ipcRenderer.invoke('internal:update-pinned-rows', rows),
    // 通知主渲染进程更新搜索框模式
    updateSearchMode: async (mode) =>
      await electron.ipcRenderer.invoke('internal:update-search-mode', mode),
    // 通知主渲染进程更新 Tab 键目标指令
    updateTabTarget: async (target) =>
      await electron.ipcRenderer.invoke('internal:update-tab-target', target),
    // 通知主渲染进程更新空格打开指令配置
    updateSpaceOpenCommand: async (enabled) =>
      await electron.ipcRenderer.invoke('internal:update-space-open-command', enabled),
    // 通知主渲染进程更新悬浮球双击目标指令
    updateFloatingBallDoubleClickCommand: async (command) =>
      await electron.ipcRenderer.invoke(
        'internal:update-floating-ball-double-click-command',
        command
      ),
    // 通知主渲染进程更新本地应用搜索配置
    updateLocalAppSearch: async (enabled) =>
      await electron.ipcRenderer.invoke('internal:update-local-app-search', enabled),
    // 通知主渲染进程更新主题色
    updatePrimaryColor: async (primaryColor, customColor) =>
      await electron.ipcRenderer.invoke('internal:update-primary-color', primaryColor, customColor),
    // 通知主渲染进程更新亚克力透明度
    updateAcrylicOpacity: async (lightOpacity, darkOpacity) =>
      await electron.ipcRenderer.invoke(
        'internal:update-acrylic-opacity',
        lightOpacity,
        darkOpacity
      ),

    // 监听窗口材质更新
    onUpdateWindowMaterial: (callback) => {
      windowMaterialChangeCallback = callback
    },

    // ==================== 应用更新 API ====================
    updaterCheckUpdate: async () =>
      await electron.ipcRenderer.invoke('internal:updater-check-update'),
    updaterStartUpdate: async (updateInfo) =>
      await electron.ipcRenderer.invoke('internal:updater-start-update', updateInfo),
    updaterSetAutoCheck: async (enabled) =>
      await electron.ipcRenderer.invoke('internal:updater-set-auto-check', enabled),

    // ==================== WebDAV 同步 API ====================
    syncTestConnection: async (config) =>
      await electron.ipcRenderer.invoke('sync:test-connection', config),
    syncSaveConfig: async (config) => await electron.ipcRenderer.invoke('sync:save-config', config),
    syncGetConfig: async () => await electron.ipcRenderer.invoke('sync:get-config'),
    syncPerformSync: async () => await electron.ipcRenderer.invoke('sync:perform-sync'),
    syncForceDownloadFromCloud: async () =>
      await electron.ipcRenderer.invoke('sync:force-download-from-cloud'),
    syncStopAutoSync: async () => await electron.ipcRenderer.invoke('sync:stop-auto-sync'),
    syncGetUnsyncedCount: async () => await electron.ipcRenderer.invoke('sync:get-unsynced-count'),

    // ==================== 其他 API ====================
    revealInFinder: async (path) =>
      await electron.ipcRenderer.invoke('internal:reveal-in-finder', path),

    // 通知主渲染进程禁用指令列表已更改
    notifyDisabledCommandsChanged: async () =>
      await electron.ipcRenderer.invoke('internal:notify-disabled-commands-changed'),

    // 固定/取消固定指令到搜索窗口
    pinApp: async (app) => await electron.ipcRenderer.invoke('internal:pin-app', app),
    unpinApp: async (appPath, featureCode, name) =>
      await electron.ipcRenderer.invoke('internal:unpin-app', appPath, featureCode, name),

    // ==================== 图片分析 API ====================
    analyzeImage: async (imagePath) =>
      await electron.ipcRenderer.invoke('internal:analyze-image', imagePath),

    // ==================== 超级面板 API ====================
    updateSuperPanelConfig: async (config) =>
      await electron.ipcRenderer.invoke('internal:update-super-panel-config', config),
    pinToSuperPanel: async (command) =>
      await electron.ipcRenderer.invoke('super-panel:pin-command', command),
    unpinSuperPanelCommand: async (path, featureCode) =>
      await electron.ipcRenderer.invoke('super-panel:unpin-command', path, featureCode),
    getSuperPanelPinned: async () => await electron.ipcRenderer.invoke('super-panel:get-pinned'),

    // ==================== AI 模型管理 API ====================
    aiModels: {
      getAll: async () => await electron.ipcRenderer.invoke('internal:ai-models-get-all'),
      add: async (model) => await electron.ipcRenderer.invoke('internal:ai-models-add', model),
      update: async (model) =>
        await electron.ipcRenderer.invoke('internal:ai-models-update', model),
      delete: async (modelId) =>
        await electron.ipcRenderer.invoke('internal:ai-models-delete', modelId)
    },

    // ==================== 网页快开 API ====================
    webSearch: {
      getAll: async () => await electron.ipcRenderer.invoke('internal:web-search-get-all'),
      add: async (engine) => await electron.ipcRenderer.invoke('internal:web-search-add', engine),
      update: async (engine) =>
        await electron.ipcRenderer.invoke('internal:web-search-update', engine),
      delete: async (engineId) =>
        await electron.ipcRenderer.invoke('internal:web-search-delete', engineId),
      fetchFavicon: async (url) =>
        await electron.ipcRenderer.invoke('internal:web-search-fetch-favicon', url)
    },

    // ==================== 悬浮球 API ====================
    setFloatingBallEnabled: async (enabled) =>
      await electron.ipcRenderer.invoke('floating-ball:set-enabled', enabled),
    getFloatingBallEnabled: async () =>
      await electron.ipcRenderer.invoke('floating-ball:get-enabled'),
    setFloatingBallLetter: async (letter) =>
      await electron.ipcRenderer.invoke('floating-ball:set-letter', letter),
    getFloatingBallLetter: async () =>
      await electron.ipcRenderer.invoke('floating-ball:get-letter'),

    // ==================== HTTP 服务 API ====================
    httpServerGetConfig: async () =>
      await electron.ipcRenderer.invoke('internal:http-server-get-config'),
    httpServerSaveConfig: async (config) =>
      await electron.ipcRenderer.invoke('internal:http-server-save-config', config),
    httpServerRegenerateKey: async () =>
      await electron.ipcRenderer.invoke('internal:http-server-regenerate-key'),
    httpServerStatus: async () => await electron.ipcRenderer.invoke('internal:http-server-status'),

    // ==================== 调试日志 API ====================
    logEnable: async () => await electron.ipcRenderer.invoke('internal:log-enable'),
    logDisable: async () => await electron.ipcRenderer.invoke('internal:log-disable'),
    logGetBuffer: async () => await electron.ipcRenderer.invoke('internal:log-get-buffer'),
    logIsEnabled: async () => await electron.ipcRenderer.invoke('internal:log-is-enabled'),
    logSubscribe: async () => await electron.ipcRenderer.invoke('internal:log-subscribe'),
    onLogEntries: (callback) => {
      if (callback && typeof callback === 'function') {
        logEntriesCallback = callback
      }
    },
    offLogEntries: (callback) => {
      if (logEntriesCallback === callback) logEntriesCallback = null
    }
  },

  // Sharp 图像处理
  sharp: (input, options) => getSharp()(input, options)
}

electron.ipcRenderer.on('on-plugin-enter', (event, launchParam) => {
  console.log('插件进入参数:', launchParam)
  if (enterCallback) {
    dispatchPluginEnter(launchParam)
    return
  }

  // 晚绑定场景：先缓存最近一次 enter，待 onPluginEnter 注册后回放
  pendingEnterPayload = launchParam
  pendingEnterMeta = {
    assemblyId: launchParam?.__assemblyId,
    ts: launchParam?.__ts
  }
  console.log('[PluginRuntime][Enter] enter-received-buffered', pendingEnterMeta)
})

// 监听插件退出事件
electron.ipcRenderer.on('plugin-out', (event, isKill) => {
  console.log('插件退出事件:', isKill)
  if (pluginOutCallback) pluginOutCallback(isKill)
})

// 监听插件分离事件
electron.ipcRenderer.on('plugin-detach', () => {
  console.log('插件分离事件')
  if (pluginDetachCallback) pluginDetachCallback()
})

electron.ipcRenderer.on('clipboard-change', (event, item) => {
  console.log('剪贴板变化:', item)
  if (clipboardChangeCallback) clipboardChangeCallback(item)
})

// 监听子输入框变化事件
electron.ipcRenderer.on('sub-input-change', (event, details) => {
  console.log('子输入框变化:', details)
  if (subInputChangeCallback) subInputChangeCallback(details)
})

// 监听 mainPush 查询请求（搜索时主进程转发）
electron.ipcRenderer.on('main-push-query', (event, { queryData, callId }) => {
  try {
    let allResults = []
    if (mainPushCallback) {
      try {
        const results = mainPushCallback.callback(queryData)
        if (Array.isArray(results) && results.length > 0) {
          allResults = allResults.concat(results)
        }
      } catch (e) {
        console.error('mainPush callback error:', e)
      }
    }
    electron.ipcRenderer.send(`main-push-result-${callId}`, {
      success: true,
      results: allResults
    })
  } catch (error) {
    electron.ipcRenderer.send(`main-push-result-${callId}`, {
      success: false,
      error: error.message
    })
  }
})

// 监听 mainPush 选择事件（用户选择搜索结果时触发）
electron.ipcRenderer.on('main-push-select', (event, { selectData, callId }) => {
  try {
    let shouldEnterPlugin = false
    if (
      mainPushCallback &&
      mainPushCallback.selectCallback &&
      typeof mainPushCallback.selectCallback === 'function'
    ) {
      try {
        const result = mainPushCallback.selectCallback(selectData)
        if (result === true) {
          shouldEnterPlugin = true
        }
      } catch (e) {
        console.error('mainPush selectCallback error:', e)
      }
    }
    electron.ipcRenderer.send(`main-push-select-result-${callId}`, {
      success: true,
      shouldEnterPlugin
    })
  } catch (error) {
    electron.ipcRenderer.send(`main-push-select-result-${callId}`, {
      success: false,
      error: error.message
    })
  }
})

// 监听快捷键录制事件
electron.ipcRenderer.on('hotkey-recorded', (event, shortcut) => {
  console.log('收到快捷键录制事件:', shortcut)
  if (hotkeyRecordedCallback) hotkeyRecordedCallback(shortcut)
})

// 监听主进程的插件方法调用请求（用于无界面插件）
electron.ipcRenderer.on('call-plugin-method', async (event, { featureCode, action, callId }) => {
  try {
    // 检查 window.exports 是否存在
    if (!window.exports) {
      electron.ipcRenderer.send(`plugin-method-result-${callId}`, {
        success: false,
        error: 'window.exports is not defined'
      })
      return
    }

    // 获取对应的 feature
    const feature = window.exports[featureCode]
    if (!feature) {
      electron.ipcRenderer.send(`plugin-method-result-${callId}`, {
        success: false,
        error: `Feature "${featureCode}" not found`
      })
      return
    }

    // 检查 mode
    if (feature.mode !== 'none') {
      electron.ipcRenderer.send(`plugin-method-result-${callId}`, {
        success: false,
        error: `Mode "${feature.mode}" is not supported`
      })
      return
    }

    // 检查 enter 方法
    if (!feature.args || typeof feature.args.enter !== 'function') {
      electron.ipcRenderer.send(`plugin-method-result-${callId}`, {
        success: false,
        error: 'Feature does not have a valid enter function'
      })
      return
    }

    // 调用方法
    const result = await feature.args.enter(action)

    // 返回成功结果
    electron.ipcRenderer.send(`plugin-method-result-${callId}`, {
      success: true,
      result
    })
  } catch (error) {
    // 返回错误
    electron.ipcRenderer.send(`plugin-method-result-${callId}`, {
      success: false,
      error: error.message || String(error)
    })
    throw error
  }
})

// 监听 ESC 键，支持插件内部阻止返回
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape') {
      electron.ipcRenderer.send('plugin-esc-pressed')
    }
  },
  false
)

// 监听主进程获取插件模式的请求
electron.ipcRenderer.on('get-plugin-mode', (event, { featureCode, callId }) => {
  // console.log('收到获取插件模式请求:', featureCode)
  const mode =
    window.exports && window.exports[featureCode] ? window.exports[featureCode].mode : undefined
  electron.ipcRenderer.send(`plugin-mode-result-${callId}`, mode)
})

// 监听主进程发送的窗口材质更新事件
electron.ipcRenderer.on('update-window-material', (event, material) => {
  if (windowMaterialChangeCallback) windowMaterialChangeCallback(material)
})

// 监听主进程推送的调试日志
electron.ipcRenderer.on('log-entries', (event, entries) => {
  if (logEntriesCallback) logEntriesCallback(entries)
})

// 监听页面内查找结果
electron.ipcRenderer.on('found-in-page-result', (event, result) => {
  if (foundInPageCallback) foundInPageCallback(result)
})
