import { BrowserWindow, session, WebContents, WebContentsView } from 'electron'
import fsSync from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import hideWindowHtml from '../../../resources/hideWindow.html?asset'

import mainPreload from '../../../resources/preload.js?asset'
import api from '../api'
import { WINDOW_INITIAL_HEIGHT, WINDOW_DEFAULT_HEIGHT } from '../common/constants'
import detachedWindowManager, { DETACHED_TITLEBAR_HEIGHT } from '../core/detachedWindowManager'
import { GLOBAL_SCROLLBAR_CSS } from '../core/globalStyles'
import { isInternalPlugin } from '../core/internalPlugins'
import pluginWindowManager from '../core/pluginWindowManager'
import { registerIconProtocolForSession } from '../index'
import proxyManager from './proxyManager'
import devToolsShortcut, { getDevToolsMode } from '../utils/devToolsShortcut'
import windowManager from './windowManager'

console.log('[Plugin] mainPreload', mainPreload)

interface PluginViewInfo {
  path: string
  name: string
  view: WebContentsView
  height?: number
  subInputPlaceholder?: string
  subInputValue?: string // 搜索框的值
  subInputVisible?: boolean // 子输入框是否可见
  logo?: string
  isDevelopment?: boolean
}
class PluginManager {
  // ==================== 插件配置/视图创建辅助方法 ====================

  /**
   * 从数据库查询插件信息
   */
  private async fetchPluginInfoFromDB(pluginPath: string): Promise<any> {
    try {
      const plugins = await api.dbGet('plugins')
      if (plugins && Array.isArray(plugins)) {
        return plugins.find((p: any) => p.path === pluginPath) || null
      }
    } catch (error) {
      console.error('[Plugin] 查询插件信息失败:', error)
    }
    return null
  }

  /**
   * 读取 plugin.json 配置
   */
  private readPluginConfig(pluginPath: string): any {
    const pluginJsonPath = path.join(pluginPath, 'plugin.json')
    return JSON.parse(fsSync.readFileSync(pluginJsonPath, 'utf-8'))
  }

  /**
   * 构建插件 logo 的 file:// URL
   */
  private buildPluginLogoUrl(pluginPath: string, logoRelPath?: string): string {
    return logoRelPath ? pathToFileURL(path.join(pluginPath, logoRelPath)).href : ''
  }

  /**
   * 解析插件入口 URL
   * @returns pluginUrl（字符串）以及是否无界面插件
   */
  private resolvePluginUrl(
    pluginPath: string,
    pluginConfig: any,
    isDevelopment: boolean
  ): { pluginUrl: string; isConfigHeadless: boolean } {
    const isConfigHeadless = !pluginConfig.main

    if (isConfigHeadless) {
      console.log('[Plugin] 检测到无界面插件(Config):', pluginConfig.name)
      return { pluginUrl: pathToFileURL(hideWindowHtml).href, isConfigHeadless }
    }
    if (isDevelopment && pluginConfig.development?.main) {
      console.log('[Plugin] 开发中插件，使用 development.main:', pluginConfig.development.main)
      return { pluginUrl: pluginConfig.development.main, isConfigHeadless }
    }
    if (pluginConfig.main.startsWith('http')) {
      console.log('[Plugin] 网络插件:', pluginConfig.main)
      return { pluginUrl: pluginConfig.main, isConfigHeadless }
    }
    return {
      pluginUrl: pathToFileURL(path.join(pluginPath, pluginConfig.main)).href,
      isConfigHeadless
    }
  }

  /**
   * 创建并配置插件的 session（注册 preload、代理、图标协议）
   */
  private async setupPluginSession(pluginName: string): Promise<Electron.Session> {
    const sess = session.fromPartition('persist:' + pluginName)
    sess.registerPreloadScript({ type: 'frame', filePath: mainPreload })
    await proxyManager.applyProxyToSession(sess, `插件 ${pluginName}`)
    if (isInternalPlugin(pluginName)) {
      registerIconProtocolForSession(sess)
    }
    return sess
  }

  /**
   * 创建插件的 WebContentsView 实例
   */
  private createPluginWebContentsView(
    sess: Electron.Session,
    preloadPath?: string
  ): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: false,
        nodeIntegration: false,
        webSecurity: false,
        sandbox: false,
        allowRunningInsecureContent: true,
        webviewTag: true,
        preload: preloadPath,
        session: sess,
        defaultFontSize: 14
      }
    })
    view.setBackgroundColor('#00000000')
    return view
  }

  /**
   * 通知渲染进程：插件已打开
   */
  private sendPluginOpenedEvent(
    pluginConfig: any,
    pluginPath: string,
    logoUrl: string,
    cmdName: string,
    subInputPlaceholder: string,
    subInputVisible: boolean
  ): void {
    this.mainWindow?.webContents.send('plugin-opened', {
      name: pluginConfig.name,
      title: pluginConfig.title || pluginConfig.name,
      logo: logoUrl,
      path: pluginPath,
      cmdName,
      subInputPlaceholder,
      subInputVisible
    })
  }

  /**
   * 通知渲染进程：插件页面已加载完成
   */
  private sendPluginLoadedEvent(pluginName: string, pluginPath: string): void {
    this.mainWindow?.webContents.send('plugin-loaded', {
      name: pluginName,
      path: pluginPath
    })
  }
  private mainWindow: BrowserWindow | null = null
  private pluginView: WebContentsView | null = null
  private currentPluginPath: string | null = null
  private pluginViews: Array<PluginViewInfo> = []
  // 记录最近一次插件 ESC 触发的时间，用于短时间内抑制主窗口 hide
  private lastPluginEscTime: number | null = null
  // 插件默认高度（可配置）
  private pluginDefaultHeight: number = WINDOW_DEFAULT_HEIGHT - WINDOW_INITIAL_HEIGHT

  /**
   * 获取插件默认高度
   */
  public getPluginDefaultHeight(): number {
    return this.pluginDefaultHeight
  }

  /**
   * 设置插件默认高度
   */
  public setPluginDefaultHeight(height: number): void {
    this.pluginDefaultHeight = Math.max(200, height) // 最小 200px
  }

  public init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
  }

  // 创建或更新插件视图
  public async createPluginView(
    pluginPath: string,
    featureCode: string,
    cmdName?: string
  ): Promise<void> {
    if (!this.mainWindow) return

    console.log('[Plugin] 准备加载插件:', { pluginPath, featureCode })

    const pluginInfoFromDB = await this.fetchPluginInfoFromDB(pluginPath)

    // 如果当前插件就是这个插件，直接返回
    if (this.currentPluginPath === pluginPath) {
      const cached = this.pluginViews.find((v) => v.path === pluginPath)
      if (cached) {
        this.processPluginMode(pluginPath, featureCode, cached.view)
      }
      return
    }

    if (this.currentPluginPath != null) {
      this.hidePluginView()
    }

    // 先尝试从缓存中复用已有视图
    const cached = this.pluginViews.find((v) => v.path === pluginPath)
    if (cached) {
      this.restoreCachedPluginView(cached, pluginPath, pluginInfoFromDB, featureCode, cmdName)
      return
    }

    // 缓存未命中，创建新的插件视图
    await this.createNewPluginView(pluginPath, pluginInfoFromDB, featureCode, cmdName)
  }

  /**
   * 恢复缓存的插件视图
   */
  private restoreCachedPluginView(
    cached: PluginViewInfo,
    pluginPath: string,
    pluginInfoFromDB: any,
    featureCode: string,
    cmdName?: string
  ): void {
    if (!this.mainWindow) return

    this.pluginView = cached.view
    this.mainWindow.contentView.addChildView(this.pluginView)

    console.log('[Plugin] 插件视图获取焦点')
    this.pluginView.webContents.focus()

    // 恢复之前的高度或使用默认高度
    const isConfigHeadless = !pluginInfoFromDB?.main
    if (isConfigHeadless) {
      this.setExpendHeight(0, false)
    } else {
      this.setExpendHeight(cached.height || this.pluginDefaultHeight, false)
    }

    this.currentPluginPath = pluginPath

    // 读取插件配置并通知渲染进程
    try {
      const pluginConfig = this.readPluginConfig(pluginPath)
      const logoUrl = this.buildPluginLogoUrl(pluginPath, pluginConfig.logo)

      this.sendPluginOpenedEvent(
        pluginConfig,
        pluginPath,
        logoUrl,
        cmdName || '',
        cached.subInputPlaceholder || '搜索',
        cached.subInputVisible !== undefined ? cached.subInputVisible : false
      )
      this.sendPluginLoadedEvent(pluginConfig.name, pluginPath)
    } catch (error) {
      console.error('[Plugin] 读取插件配置失败:', error)
    }

    console.log('[Plugin] 复用缓存的 Plugin BrowserView')
    this.processPluginMode(pluginPath, featureCode, this.pluginView)
  }

  /**
   * 创建全新的插件视图（缓存未命中时调用）
   */
  private async createNewPluginView(
    pluginPath: string,
    pluginInfoFromDB: any,
    featureCode: string,
    cmdName?: string
  ): Promise<void> {
    if (!this.mainWindow) return

    try {
      // 插件加载时，先将窗口高度设置为 1px，避免节流
      api.resizeWindow(WINDOW_INITIAL_HEIGHT + 1)
      const pluginConfig = this.readPluginConfig(pluginPath)
      const isDevelopment = !!pluginInfoFromDB?.isDevelopment
      const { pluginUrl, isConfigHeadless } = this.resolvePluginUrl(
        pluginPath,
        pluginConfig,
        isDevelopment
      )

      const preloadPath = pluginConfig.preload
        ? path.join(pluginPath, pluginConfig.preload)
        : undefined

      const sess = await this.setupPluginSession(pluginConfig.name)
      this.pluginView = this.createPluginWebContentsView(sess, preloadPath)

      // 注册主窗口专属的事件监听
      this.registerMainWindowPluginEvents(this.pluginView, pluginPath)

      this.mainWindow.contentView.addChildView(this.pluginView)

      // 设置初始布局
      const [windowWidth] = this.mainWindow.getSize()
      let initialViewHeight: number | null = null

      // 设置初始高度为 1px，避免节流
      this.pluginView.setBounds({ x: 0, y: WINDOW_INITIAL_HEIGHT, width: windowWidth, height: 1 })

      if (!isConfigHeadless) {
        initialViewHeight = this.pluginDefaultHeight
      }

      // 缓存新创建的视图
      const logoUrl = this.buildPluginLogoUrl(pluginPath, pluginConfig.logo)
      const pluginInfo: PluginViewInfo = {
        path: pluginPath,
        name: pluginConfig.name,
        view: this.pluginView,
        subInputPlaceholder: '搜索',
        subInputVisible: false,
        logo: logoUrl,
        isDevelopment
      }
      this.pluginViews.push(pluginInfo)
      this.currentPluginPath = pluginPath

      // 通知渲染进程插件已打开
      this.sendPluginOpenedEvent(
        pluginConfig,
        pluginPath,
        logoUrl,
        cmdName || '',
        pluginInfo.subInputPlaceholder!,
        pluginInfo.subInputVisible!
      )

      const view = this.pluginView
      view.webContents.loadURL(pluginUrl)

      view.webContents.on('dom-ready', async () => {
        view.webContents.insertCSS(GLOBAL_SCROLLBAR_CSS)
        this.processPluginMode(pluginPath, featureCode, view)
        this.sendPluginLoadedEvent(pluginConfig.name, pluginPath)

        if (initialViewHeight !== null) {
          this.setExpendHeight(initialViewHeight, true)
        }
      })

      console.log('[Plugin] Plugin WebContentsView 已创建并缓存')
    } catch (error) {
      console.error('[Plugin] 加载插件配置失败:', error)
    }
  }

  /**
   * 为主窗口中运行的插件视图注册事件监听
   * （devtools、焦点、快捷键、进程崩溃等）
   */
  private registerMainWindowPluginEvents(view: WebContentsView, pluginPath: string): void {
    view.webContents.on('devtools-opened', () => {
      console.log('[Plugin] 插件开发者工具已打开')
    })

    view.webContents.on('focus', () => {
      windowManager.updateFocusTarget('plugin')
      if (this.pluginView && !this.pluginView.webContents.isDestroyed()) {
        devToolsShortcut.register(this.pluginView.webContents)
      }
    })

    view.webContents.on('blur', () => {
      devToolsShortcut.unregister()
    })

    // Cmd+D / Ctrl+D 和 Cmd+Q / Ctrl+Q 快捷键
    view.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'd' || input.key === 'D') &&
        (input.meta || input.control)
      ) {
        event.preventDefault()
        console.log('[Plugin] 插件视图检测到 Cmd+D 快捷键')
        this.detachCurrentPlugin()
      }

      if (
        input.type === 'keyDown' &&
        (input.key === 'q' || input.key === 'Q') &&
        (input.meta || input.control)
      ) {
        event.preventDefault()
        console.log('[Plugin] 插件视图检测到 Cmd+Q 快捷键，终止插件')
        this.killCurrentPlugin()
      }
    })

    // 插件进程崩溃或退出
    view.webContents.on('render-process-gone', (_event, details) => {
      console.log('[Plugin] 插件进程已退出:', {
        pluginPath,
        reason: details.reason,
        exitCode: details.exitCode
      })

      if (!this.pluginView?.webContents.isDestroyed()) {
        this.pluginView?.webContents.send('plugin-out', true)
      }

      const index = this.pluginViews.findIndex((v) => v.path === pluginPath)
      if (index !== -1) {
        this.pluginViews.splice(index, 1)
        console.log('[Plugin] 已从缓存中移除崩溃的插件:', pluginPath)
      }

      if (this.currentPluginPath === pluginPath) {
        this.hidePluginView()
        windowManager.notifyBackToSearch()
        this.currentPluginPath = null
        console.log('[Plugin] 插件崩溃，已返回搜索页面')
      }

      pluginWindowManager.closeByPlugin(pluginPath)
    })
  }

  // 发送消息到插件
  public sendPluginMessage(eventName: string, data: any): void {
    if (this.pluginView && this.pluginView.webContents) {
      this.pluginView.webContents.send(eventName, data)
    }
  }

  // 隐藏插件视图
  public hidePluginView(): void {
    if (this.pluginView && this.mainWindow) {
      const currentPath = this.currentPluginPath
      const pluginView = this.pluginView

      // 发送插件退出事件（isKill=false 表示正常退出）
      if (!pluginView.webContents.isDestroyed()) {
        pluginView.webContents.send('plugin-out', false)
      }

      // 获取插件名称
      const cached = this.pluginViews.find((v) => v.path === currentPath)
      const pluginName = cached?.name

      // 仅移除视图以达到隐藏效果，但保留实例以便复用
      this.mainWindow.contentView.removeChildView(pluginView)
      console.log('[Plugin] Plugin WebContentsView 已隐藏，缓存保留')

      // 将当前引用清空，但缓存仍保留
      this.pluginView = null
      this.currentPluginPath = null

      // 通知渲染进程插件已关闭
      this.mainWindow.webContents.send('plugin-closed')

      // 检查是否需要终止插件（延迟异步处理）
      if (pluginName && currentPath) {
        this.checkAndKillPlugin(pluginName, currentPath)
      }
    }
  }

  // 检查并终止插件
  private async checkAndKillPlugin(pluginName: string, pluginPath: string): Promise<void> {
    // 延迟处理，确保隐藏动画或其他逻辑已完成
    await new Promise((resolve) => setTimeout(resolve, 200))

    try {
      const data = await api.dbGet('outKillPlugin')
      if (data && Array.isArray(data) && data.includes(pluginName)) {
        console.log(`插件 ${pluginName} 配置为退出后立即结束，销毁 view`)
        this.killPlugin(pluginPath)
      }
    } catch (error) {
      // 配置不存在或读取失败，保持默认行为（不销毁）
      console.log('[Plugin] 读取 outKillPlugin 配置失败:', error)
    }
  }

  // 获取当前加载的插件路径
  public getCurrentPluginPath(): string | null {
    return this.currentPluginPath
  }

  // 获取当前加载的插件视图
  public getCurrentPluginView(): WebContentsView | null {
    return this.pluginView
  }

  public focusPluginView(): void {
    if (this.pluginView && this.pluginView.webContents) {
      console.log('[Plugin] 插件视图获取焦点')
      this.pluginView.webContents.focus()
    }
  }

  /**
   * 后台预加载插件（不显示在主窗口中，仅创建 WebContentsView 并缓存）
   * 用于"跟随主程序同时启动运行"功能
   */
  public async preloadPlugin(pluginPath: string): Promise<void> {
    if (!this.mainWindow) return

    // 如果已经在缓存中，跳过
    const existing = this.pluginViews.find((v) => v.path === pluginPath)
    if (existing) {
      console.log('[Plugin] 插件已在运行中，跳过预加载:', pluginPath)
      return
    }

    try {
      const pluginInfoFromDB = await this.fetchPluginInfoFromDB(pluginPath)
      const pluginConfig = this.readPluginConfig(pluginPath)
      const isDevelopment = !!pluginInfoFromDB?.isDevelopment
      const { pluginUrl } = this.resolvePluginUrl(pluginPath, pluginConfig, isDevelopment)

      const preloadPath = pluginConfig.preload
        ? path.join(pluginPath, pluginConfig.preload)
        : undefined

      const sess = await this.setupPluginSession(pluginConfig.name)
      const view = this.createPluginWebContentsView(sess, preloadPath)

      // 注册事件监听
      this.registerMainWindowPluginEvents(view, pluginPath)

      // 缓存视图（但不添加到主窗口、不设为当前插件）
      const logoUrl = this.buildPluginLogoUrl(pluginPath, pluginConfig.logo)
      const pluginInfo: PluginViewInfo = {
        path: pluginPath,
        name: pluginConfig.name,
        view,
        subInputPlaceholder: '搜索',
        subInputVisible: false,
        logo: logoUrl,
        isDevelopment
      }
      this.pluginViews.push(pluginInfo)

      // 加载插件 URL
      view.webContents.loadURL(pluginUrl)

      view.webContents.on('dom-ready', () => {
        view.webContents.insertCSS(GLOBAL_SCROLLBAR_CSS)
        console.log('[Plugin] 后台预加载插件完成:', pluginConfig.name)
      })

      console.log('[Plugin] 后台预加载插件:', pluginConfig.name)
    } catch (error) {
      console.error('[Plugin] 后台预加载插件失败:', pluginPath, error)
    }
  }

  // 获取所有运行中的插件路径
  public getRunningPlugins(): string[] {
    return this.pluginViews.map((v) => v.path)
  }

  // 获取所有运行中的插件信息 (包含路径和名称)
  public getRunningPluginsInfo(): Array<{ path: string; name: string }> {
    return this.pluginViews.map((v) => ({ path: v.path, name: v.name }))
  }

  // 获取所有插件视图
  public getAllPluginViews(): Array<PluginViewInfo> {
    return this.pluginViews
  }

  // 通过 webContents 查找插件名称
  public getPluginNameByWebContents(webContents: any): string | null {
    const plugin = this.pluginViews.find((v) => v.view.webContents === webContents)
    return plugin ? plugin.name : null
  }

  // 终止指定插件
  public killPlugin(pluginPath: string): boolean {
    try {
      const index = this.pluginViews.findIndex((v) => v.path === pluginPath)
      if (index === -1) {
        console.log('[Plugin] 插件未运行:', pluginPath)
        return false
      }

      const { view } = this.pluginViews[index]

      // 发送插件退出事件（isKill=true 表示进程结束）
      if (!view.webContents.isDestroyed()) {
        view.webContents.send('plugin-out', true)
      }

      // 如果是当前显示的插件，先隐藏
      if (this.currentPluginPath === pluginPath && this.mainWindow) {
        this.mainWindow.contentView.removeChildView(view)
        this.pluginView = null
        this.currentPluginPath = null
      }

      // 销毁 webContents
      if (!view.webContents.isDestroyed()) {
        view.webContents.close()
      }

      // 关闭该插件创建的所有窗口
      pluginWindowManager.closeByPlugin(pluginPath)

      // 从缓存中移除
      this.pluginViews.splice(index, 1)

      console.log('[Plugin] 插件已终止:', pluginPath)
      return true
    } catch (error) {
      console.error('[Plugin] 终止插件失败:', error)
      return false
    }
  }

  // 终止所有插件
  public killAllPlugins(): void {
    for (const { view, path } of this.pluginViews) {
      try {
        // 发送插件退出事件（isKill=true 表示进程结束）
        if (!view.webContents.isDestroyed()) {
          view.webContents.send('plugin-out', true)
        }
        if (!view.webContents.isDestroyed()) {
          view.webContents.close()
        }
        // 关闭该插件创建的所有窗口
        pluginWindowManager.closeByPlugin(path)
        console.log('[Plugin] 插件已终止:', path)
      } catch (error) {
        console.error('[Plugin] 终止插件失败:', path, error)
      }
    }

    if (this.mainWindow && this.pluginView) {
      this.mainWindow.contentView.removeChildView(this.pluginView)
    }

    this.pluginViews = []
    this.pluginView = null
    this.currentPluginPath = null
  }

  /**
   * 终止当前插件并返回搜索页面
   * 用于 Cmd+Q / Ctrl+Q 快捷键
   */
  public killCurrentPlugin(): void {
    if (!this.currentPluginPath) {
      console.log('[Plugin] 没有正在运行的插件')
      return
    }

    const pluginPath = this.currentPluginPath

    // 终止插件
    const success = this.killPlugin(pluginPath)

    if (success && this.mainWindow) {
      windowManager.notifyBackToSearch()
      // 主窗口获取焦点
      this.mainWindow.webContents.focus()
      console.log('[Plugin] 已终止插件并返回搜索页面')
    }
  }

  // 发送输入事件到当前插件（统一接口）
  public sendInputEvent(
    event: Electron.MouseInputEvent | Electron.MouseWheelInputEvent | Electron.KeyboardInputEvent
  ): boolean {
    try {
      if (!this.pluginView || this.pluginView.webContents.isDestroyed()) {
        console.log('[Plugin] 没有活动的插件视图')
        return false
      }

      this.pluginView.webContents.sendInputEvent(event)

      console.log('[Plugin] 发送输入事件:', event)
      return true
    } catch (error) {
      console.error('[Plugin] 发送输入事件失败:', error)
      return false
    }
  }

  // 切换当前插件的开发者工具（打开/关闭）
  public async openPluginDevTools(): Promise<boolean> {
    try {
      if (!this.pluginView || this.pluginView.webContents.isDestroyed()) {
        console.log('[Plugin] 没有活动的插件视图')
        return false
      }

      // 检查开发者工具是否已打开
      if (this.pluginView.webContents.isDevToolsOpened()) {
        // 如果已打开，关闭开发者工具
        this.pluginView.webContents.closeDevTools()
        console.log('[Plugin] 已关闭插件开发者工具')
      } else {
        // 如果未打开，打开开发者工具
        const mode = await getDevToolsMode()
        this.pluginView.webContents.openDevTools({ mode })
        console.log('[Plugin] 已打开插件开发者工具')
      }
      return true
    } catch (error) {
      console.error('[Plugin] 切换开发者工具失败:', error)
      return false
    }
  }

  // 设置插件视图高度
  public setExpendHeight(height: number, updateCache: boolean = true): void {
    if (!this.mainWindow || !this.pluginView) return

    console.log('[Plugin] 设置插件高度:', height)

    // 搜索框高度
    const mainContentHeight = WINDOW_INITIAL_HEIGHT
    // 计算总窗口高度
    const totalHeight = height + mainContentHeight

    // 获取当前窗口宽度
    const [width] = this.mainWindow.getSize()

    // 通过 api.resizeWindow 调整主窗口大小
    api.resizeWindow(totalHeight)

    // 调整插件视图大小
    this.pluginView.setBounds({
      x: 0,
      y: mainContentHeight,
      width: width,
      height: height
    })

    // 更新缓存中的高度
    if (updateCache) {
      const cached = this.pluginViews.find((v) => v.view === this.pluginView)
      if (cached) {
        cached.height = height
      }
    }
  }

  // 设置子输入框 placeholder
  public setSubInputPlaceholder(placeholder: string): void {
    if (!this.pluginView) return

    // 更新缓存中的 placeholder
    const cached = this.pluginViews.find((v) => v.view === this.pluginView)
    if (cached) {
      cached.subInputPlaceholder = placeholder
    }
  }

  // 设置子输入框可见性
  public setSubInputVisible(pluginPath: string, visible: boolean): void {
    const cached = this.pluginViews.find((v) => v.path === pluginPath)
    if (cached) {
      cached.subInputVisible = visible
      console.log(`更新插件 ${pluginPath} 的子输入框可见性:`, visible)
    }
  }

  // 设置子输入框值
  public setSubInputValue(value: string): void {
    if (!this.pluginView) return

    // 更新缓存中的值
    const cached = this.pluginViews.find((v) => v.view === this.pluginView)
    if (cached) {
      cached.subInputValue = value
    }
  }

  // 更新插件视图大小（跟随窗口大小变化）
  public updatePluginViewBounds(width: number, height: number): void {
    if (!this.pluginView) return

    const mainContentHeight = WINDOW_INITIAL_HEIGHT
    const viewHeight = height - mainContentHeight

    if (viewHeight > 0) {
      this.pluginView.setBounds({
        x: 0,
        y: mainContentHeight,
        width: width,
        height: viewHeight
      })

      // 更新缓存中的高度
      const cached = this.pluginViews.find((v) => v.view === this.pluginView)
      if (cached) {
        cached.height = viewHeight
      }
    }
  }

  // 获取插件模式
  private async getPluginMode(
    webContents: WebContents,
    featureCode: string
  ): Promise<string | undefined> {
    if (webContents.isDestroyed()) return undefined

    const callId = Math.random().toString(36).substring(2, 11)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(undefined), 1000) // 1s timeout

      webContents.ipc.once(`plugin-mode-result-${callId}`, (_event, mode) => {
        clearTimeout(timeout)
        resolve(mode)
      })

      webContents.send('get-plugin-mode', { featureCode, callId })
    })
  }

  // ==================== 无界面插件相关方法 ====================

  // 处理插件模式
  private async processPluginMode(
    pluginPath: string,
    featureCode: string,
    view: WebContentsView
  ): Promise<void> {
    const mode = await this.getPluginMode(view.webContents, featureCode)
    console.log('[Plugin] 插件模式:', mode)

    // 检查视图是否仍是活动视图
    if (this.pluginView !== view) return

    if (mode === 'none') {
      // 无界面插件，调用插件方法
      this.setExpendHeight(0, false) // 不更新缓存，保留上次的 UI 高度
      this.callHeadlessPluginMethod(pluginPath, featureCode, api.getLaunchParam())
    } else {
      // 有界面插件
      // 恢复高度: 优先使用缓存的高度，如果没有则使用默认高度
      const cached = this.pluginViews.find((v) => v.path === pluginPath)
      let targetHeight = cached?.height || this.pluginDefaultHeight

      // 如果目标高度无效（可能被错误置为0），重置为默认值
      if (targetHeight <= 0) targetHeight = this.pluginDefaultHeight

      this.setExpendHeight(targetHeight, true)

      // 让插件视图获取焦点
      view.webContents.focus()
      // 通知插件进入事件
      view.webContents.send('on-plugin-enter', api.getLaunchParam())
    }
  }

  /**
   * 调用无界面插件方法
   */
  public async callHeadlessPluginMethod(
    pluginPath: string,
    featureCode: string,
    action: any
  ): Promise<any> {
    const plugin = this.pluginViews.find((p) => p.path === pluginPath)
    if (!plugin) {
      throw new Error('Plugin not found')
    }

    if (plugin.view.webContents.isDestroyed()) {
      throw new Error('Plugin view is destroyed')
    }

    console.log('[Plugin] 调用无界面插件方法:', { pluginPath, featureCode, action })

    // 生成唯一的调用 ID
    const callId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    // 创建 Promise 等待结果
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error('Plugin method call timeout (30s)'))
      }, 30000) // 30秒超时

      // 监听一次性返回结果
      plugin.view.webContents.ipc.once(`plugin-method-result-${callId}`, (_event, result) => {
        clearTimeout(timeout)

        if (result.success) {
          resolve(result.result)
        } else {
          reject(new Error(result.error))
        }
      })

      // 发送调用请求
      plugin.view.webContents.send('call-plugin-method', {
        featureCode,
        action,
        callId
      })
    })
  }

  // ==================== mainPush 相关方法 ====================

  /**
   * 查询插件的 mainPush 回调，获取动态搜索结果
   * 如果插件尚未加载，会先预加载
   */
  public async queryMainPush(
    pluginPath: string,
    _featureCode: string,
    queryData: { code: string; type: string; payload: string }
  ): Promise<any[]> {
    // 确保插件已加载
    let plugin = this.pluginViews.find((v) => v.path === pluginPath)
    if (!plugin) {
      await this.preloadPlugin(pluginPath)
      // 等待 dom-ready（最多 5 秒）
      plugin = this.pluginViews.find((v) => v.path === pluginPath)
      if (plugin && !plugin.view.webContents.isDestroyed()) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 5000)
          if (plugin!.view.webContents.getURL()) {
            plugin!.view.webContents.once('dom-ready', () => {
              clearTimeout(timeout)
              resolve()
            })
            // 如果已经 dom-ready 了，上面的事件不会触发，用短延时兜底
            setTimeout(() => {
              clearTimeout(timeout)
              resolve()
            }, 500)
          } else {
            clearTimeout(timeout)
            resolve()
          }
        })
      }
    }

    if (!plugin || plugin.view.webContents.isDestroyed()) {
      return []
    }

    const callId = `mp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve([]), 3000) // 3 秒超时

      plugin!.view.webContents.ipc.once(`main-push-result-${callId}`, (_event, result) => {
        clearTimeout(timeout)
        if (result.success && Array.isArray(result.results)) {
          // 处理图标路径：将相对路径转为 file:// URL（保留原始 icon 不变，用 _resolvedIcon 展示）
          const processed = result.results.map((item: any) => {
            if (item.icon && !item.icon.startsWith('http') && !item.icon.startsWith('file:') && !item.icon.startsWith('data:')) {
              return { ...item, _resolvedIcon: pathToFileURL(path.join(pluginPath, item.icon)).href }
            }
            return item
          })
          resolve(processed)
        } else {
          resolve([])
        }
      })

      plugin!.view.webContents.send('main-push-query', { queryData, callId })
    })
  }

  /**
   * 通知插件用户选择了 mainPush 结果
   * @returns 是否需要进入插件界面
   */
  public async selectMainPush(
    pluginPath: string,
    _featureCode: string,
    selectData: { code: string; type: string; payload: string; option: any }
  ): Promise<boolean> {
    const plugin = this.pluginViews.find((v) => v.path === pluginPath)
    if (!plugin || plugin.view.webContents.isDestroyed()) {
      return false
    }

    const callId = `mps_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 3000)

      plugin!.view.webContents.ipc.once(
        `main-push-select-result-${callId}`,
        (_event, result) => {
          clearTimeout(timeout)
          resolve(result.success && result.shouldEnterPlugin)
        }
      )

      plugin!.view.webContents.send('main-push-select', { selectData, callId })
    })
  }

  // 处理插件按 ESC 键
  public handlePluginEsc(): void {
    // 记录 ESC 触发时间
    this.lastPluginEscTime = Date.now()
    console.log('[Plugin] 插件按下 ESC 键 (Main Process)，返回搜索页面')
    this.hidePluginView()
    windowManager.notifyBackToSearch()
    // 主窗口获取焦点
    this.mainWindow?.webContents.focus()
  }

  /**
   * 在插件 ESC 之后的极短时间内（默认 100ms）抑制主窗口 hide
   */
  public shouldSuppressMainHide(withinMs: number = 100): boolean {
    if (this.lastPluginEscTime == null) return false
    const diff = Date.now() - this.lastPluginEscTime
    if (diff <= withinMs) {
      return true
    }
    return false
  }
  // 检查插件是否处于开发模式
  public isPluginDev(webContentsId: number): boolean {
    // 首先检查是否是插件视图
    const plugin = this.pluginViews.find((v) => v.view.webContents.id === webContentsId)
    if (plugin) {
      return !!plugin.isDevelopment
    }

    // 然后检查是否是插件创建的窗口
    const pluginPath = pluginWindowManager.getPluginPathByWebContentsId(webContentsId)
    if (pluginPath) {
      // 根据插件路径查找对应的插件视图，确认是否处于开发模式
      const pluginView = this.pluginViews.find((v) => v.path === pluginPath)
      return !!pluginView?.isDevelopment
    }

    return false
  }

  /**
   * 读取分离窗口的上次尺寸（按插件名记录）
   */
  private async getStoredDetachedSize(
    pluginName: string
  ): Promise<{ width: number; height: number } | null> {
    try {
      const sizes = await api.dbGet('detachedWindowSizes')
      if (sizes && typeof sizes === 'object' && !Array.isArray(sizes) && sizes[pluginName]) {
        const rawSize = sizes[pluginName]
        const width = Number(rawSize?.width)
        const height = Number(rawSize?.height)

        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          return null
        }

        const clampedWidth = Math.max(400, Math.round(width))
        const clampedHeight = Math.max(300 - DETACHED_TITLEBAR_HEIGHT, Math.round(height))
        return { width: clampedWidth, height: clampedHeight }
      }
    } catch (error) {
      console.error('[Plugin] 读取分离窗口尺寸失败:', error)
    }

    return null
  }

  /**
   * 直接在独立窗口中创建插件（用于自动分离模式）
   * @param pluginPath 插件路径
   * @param featureCode 功能代码
   * @returns 创建结果
   */
  public async createPluginInDetachedWindow(
    pluginPath: string,
    featureCode: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[Plugin] 直接在独立窗口中创建插件:', { pluginPath, featureCode })

      const pluginInfoFromDB = await this.fetchPluginInfoFromDB(pluginPath)
      const pluginConfig = this.readPluginConfig(pluginPath)
      const isDevelopment = !!pluginInfoFromDB?.isDevelopment
      const { pluginUrl, isConfigHeadless } = this.resolvePluginUrl(
        pluginPath,
        pluginConfig,
        isDevelopment
      )

      if (isConfigHeadless) {
        return { success: false, error: '无界面插件不支持在独立窗口中打开' }
      }

      const preloadPath = pluginConfig.preload
        ? path.join(pluginPath, pluginConfig.preload)
        : undefined

      const sess = await this.setupPluginSession(pluginConfig.name)
      const pluginView = this.createPluginWebContentsView(sess, preloadPath)

      // 监听插件进程崩溃或退出
      pluginView.webContents.on('render-process-gone', (_event, details) => {
        console.log('[Plugin] 独立窗口插件进程已退出:', {
          pluginPath,
          reason: details.reason,
          exitCode: details.exitCode
        })
      })

      const storedSize = await this.getStoredDetachedSize(pluginConfig.name)
      const windowWidth = storedSize?.width ?? 800
      const viewHeight = storedSize?.height ?? this.pluginDefaultHeight
      const logoUrl = this.buildPluginLogoUrl(pluginPath, pluginConfig.logo)

      const detachedWindow = detachedWindowManager.createDetachedWindow(
        pluginPath,
        pluginConfig.name,
        pluginView,
        {
          width: windowWidth,
          height: viewHeight,
          title: pluginConfig.title || pluginConfig.name,
          logo: logoUrl,
          searchQuery: '',
          searchPlaceholder: '搜索...'
        }
      )

      if (!detachedWindow) {
        if (!pluginView.webContents.isDestroyed()) {
          pluginView.webContents.close()
        }
        return { success: false, error: '创建独立窗口失败' }
      }

      pluginView.webContents.loadURL(pluginUrl)

      pluginView.webContents.on('did-finish-load', async () => {
        pluginView.webContents.insertCSS(GLOBAL_SCROLLBAR_CSS)
        pluginView.webContents.send('on-plugin-enter', api.getLaunchParam())
      })

      console.log('[Plugin] 插件已在独立窗口中创建:', pluginConfig.name)
      return { success: true }
    } catch (error: unknown) {
      console.error('[Plugin] 在独立窗口中创建插件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 分离当前插件到独立窗口
   * 将当前在主窗口中运行的插件分离到一个独立的窗口中
   */
  public async detachCurrentPlugin(): Promise<{ success: boolean; error?: string }> {
    if (!this.mainWindow || !this.pluginView || !this.currentPluginPath) {
      return { success: false, error: '没有正在运行的插件' }
    }

    try {
      // 获取当前插件信息
      const cached = this.pluginViews.find((v) => v.path === this.currentPluginPath)
      if (!cached) {
        return { success: false, error: '插件信息未找到' }
      }

      // 读取插件配置
      const pluginJsonPath = path.join(this.currentPluginPath, 'plugin.json')
      const pluginConfig = JSON.parse(fsSync.readFileSync(pluginJsonPath, 'utf-8'))

      const storedSize = await this.getStoredDetachedSize(pluginConfig.name)
      const defaultViewHeight = this.pluginDefaultHeight

      // 若存在历史尺寸则优先使用
      const windowWidth = storedSize?.width ?? 800
      const viewHeight = storedSize?.height ?? cached.height ?? defaultViewHeight

      // 发送插件分离事件（在分离之前通知插件）
      if (!cached.view.webContents.isDestroyed()) {
        cached.view.webContents.send('plugin-detach')
      }

      // 检测主窗口是否处于焦点状态，且输入框是否处于聚焦状态
      let shouldAutoFocusSubInput = false
      try {
        const isMainWindowFocused = this.mainWindow.webContents.isFocused()
        const isInputFocused = await this.mainWindow.webContents.executeJavaScript(
          'document.activeElement?.classList.contains("search-input")'
        )
        shouldAutoFocusSubInput = isMainWindowFocused && isInputFocused
        console.log('[Plugin] 主窗口聚焦状态:', {
          windowFocused: isMainWindowFocused,
          inputFocused: isInputFocused,
          shouldAutoFocus: shouldAutoFocusSubInput
        })
      } catch (error) {
        console.error('[Plugin] 检测输入框聚焦状态失败:', error)
      }

      // 使用新的分离窗口管理器创建窗口（使用缓存的搜索框状态）
      const detachedWindow = detachedWindowManager.createDetachedWindow(
        this.currentPluginPath,
        pluginConfig.name,
        cached.view,
        {
          width: windowWidth,
          height: viewHeight,
          title: pluginConfig.title || pluginConfig.name,
          logo: cached.logo,
          searchQuery: cached.subInputValue || '',
          searchPlaceholder: cached.subInputPlaceholder || '搜索...',
          subInputVisible: cached.subInputVisible !== undefined ? cached.subInputVisible : true,
          autoFocusSubInput: shouldAutoFocusSubInput // 只有主窗口输入框聚焦时才自动聚焦
        }
      )

      if (!detachedWindow) {
        return { success: false, error: '创建独立窗口失败' }
      }

      // 从主窗口中移除插件视图
      this.mainWindow.contentView.removeChildView(this.pluginView)

      // 从缓存中移除
      const index = this.pluginViews.findIndex((v) => v.path === this.currentPluginPath)
      if (index !== -1) {
        this.pluginViews.splice(index, 1)
      }

      // 通知渲染进程插件已关闭
      this.mainWindow.webContents.send('plugin-closed')
      windowManager.notifyBackToSearch()

      // 清空当前引用
      this.pluginView = null
      this.currentPluginPath = null

      console.log('[Plugin] 插件已分离到独立窗口:', pluginConfig.name)
      return { success: true }
    } catch (error: unknown) {
      console.error('[Plugin] 分离插件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 根据 WebContents 获取插件信息
   * @param webContents WebContents 实例
   * @returns 插件信息，如果不是插件则返回 null
   */
  public getPluginInfoByWebContents(webContents: WebContents): {
    name: string
    path: string
    isInternal: boolean
  } | null {
    // 1. 先检查主窗口中的插件视图
    for (const pluginViewInfo of this.pluginViews) {
      if (pluginViewInfo.view.webContents === webContents) {
        return {
          name: pluginViewInfo.name,
          path: pluginViewInfo.path,
          isInternal: isInternalPlugin(pluginViewInfo.name)
        }
      }
    }

    // 2. 检查分离窗口中的插件
    const detachedWindows = detachedWindowManager.getAllWindows()
    for (const windowInfo of detachedWindows) {
      if (windowInfo.view.webContents === webContents) {
        return {
          name: windowInfo.pluginName,
          path: windowInfo.pluginPath,
          isInternal: isInternalPlugin(windowInfo.pluginName)
        }
      }
    }

    return null
  }

  /**
   * 根据插件名称获取插件的 WebContents
   * @param name 插件名称
   * @returns WebContents 实例，如果未找到则返回 null
   */
  public getPluginWebContentsByName(name: string): WebContents | null {
    const plugin = this.pluginViews.find((v) => v.name === name)
    return plugin ? plugin.view.webContents : null
  }

  /**
   * 检查调用者是否为内置插件
   * @param event IPC 事件对象
   * @returns 是否为内置插件调用
   */
  public isInternalPluginCaller(event: Electron.IpcMainInvokeEvent): boolean {
    const pluginInfo = this.getPluginInfoByWebContents(event.sender)
    return pluginInfo?.isInternal ?? false
  }
}

export default new PluginManager()
