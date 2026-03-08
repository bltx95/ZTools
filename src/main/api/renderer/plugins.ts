import type { PluginManager } from '../../managers/pluginManager'
import { app, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import * as tar from 'tar'
import { normalizeIconPath } from '../../common/iconUtils'
import { isInternalPlugin } from '../../core/internalPlugins'
import lmdbInstance from '../../core/lmdb/lmdbInstance'
import windowManager from '../../managers/windowManager'
import { sleep } from '../../utils/common.js'
import { downloadFile } from '../../utils/download.js'
import { httpGet } from '../../utils/httpRequest.js'
import AdmZip from 'adm-zip'
import { isValidZpx } from '../../utils/zpxArchive.js'
import { packZpx, extractZpx, readTextFromZpx, readFileFromZpx } from '../../utils/zpxArchive.js'
import { pluginFeatureAPI } from '../plugin/feature'
import webSearchAPI from './webSearch'
import databaseAPI from '../shared/database'

// 插件目录
const PLUGIN_DIR = path.join(app.getPath('userData'), 'plugins')

/**
 * 插件管理API - 主程序专用
 */
export class PluginsAPI {
  private mainWindow: Electron.BrowserWindow | null = null
  private pluginManager: PluginManager | null = null

  public init(mainWindow: Electron.BrowserWindow, pluginManager: PluginManager): void {
    this.mainWindow = mainWindow
    this.pluginManager = pluginManager
    this.setupIPC()
  }

  private setupIPC(): void {
    ipcMain.handle('get-plugins', () => this.getPlugins())
    ipcMain.handle('get-all-plugins', () => this.getAllPlugins())
    ipcMain.handle('import-plugin', () => this.importPlugin())
    ipcMain.handle('import-dev-plugin', (_event, pluginJsonPath?: string) =>
      this.importDevPlugin(pluginJsonPath)
    )
    ipcMain.handle('delete-plugin', (_event, pluginPath: string) => this.deletePlugin(pluginPath))
    ipcMain.handle('reload-plugin', (_event, pluginPath: string) => this.reloadPlugin(pluginPath))
    ipcMain.handle('get-running-plugins', () => this.getRunningPlugins())
    ipcMain.handle('kill-plugin', (_event, pluginPath: string) => this.killPlugin(pluginPath))
    ipcMain.handle('kill-plugin-and-return', (_event, pluginPath: string) =>
      this.killPluginAndReturn(pluginPath)
    )
    ipcMain.handle('fetch-plugin-market', () => this.fetchPluginMarket())
    ipcMain.handle('install-plugin-from-market', (_event, plugin: any) =>
      this.installPluginFromMarket(plugin)
    )
    ipcMain.handle('get-plugin-readme', (_event, pluginPathOrName: string, pluginName?: string) =>
      this.getPluginReadme(pluginPathOrName, pluginName)
    )
    ipcMain.handle('get-plugin-db-data', (_event, pluginName: string) =>
      this.getPluginDbData(pluginName)
    )
    ipcMain.handle('read-plugin-info-from-zpx', (_event, zpxPath: string) =>
      this.readPluginInfoFromZpx(zpxPath)
    )
    ipcMain.handle('install-plugin-from-path', (_event, zpxPath: string) =>
      this.installPluginFromPath(zpxPath)
    )
    // mainPush 功能：查询插件的动态搜索结果
    ipcMain.handle(
      'query-main-push',
      async (_event, pluginPath: string, featureCode: string, queryData: any) => {
        try {
          return await this.pluginManager?.queryMainPush(pluginPath, featureCode, queryData)
        } catch (error: unknown) {
          console.error('[Plugins] mainPush 查询失败:', error)
          return []
        }
      }
    )

    // mainPush 功能：通知插件用户选择了搜索结果
    ipcMain.handle(
      'select-main-push',
      async (_event, pluginPath: string, featureCode: string, selectData: any) => {
        try {
          return await this.pluginManager?.selectMainPush(pluginPath, featureCode, selectData)
        } catch (error: unknown) {
          console.error('[Plugins] mainPush 选择失败:', error)
          return false
        }
      }
    )

    ipcMain.handle(
      'call-headless-plugin',
      async (_event, pluginPath: string, featureCode: string, action: any) => {
        try {
          const result = await this.pluginManager?.callHeadlessPluginMethod(
            pluginPath,
            featureCode,
            action
          )
          return { success: true, result }
        } catch (error: unknown) {
          console.error('[Plugins] 调用无界面插件失败:', error)
          return { success: false, error: error instanceof Error ? error.message : '未知错误' }
        }
      }
    )

    ipcMain.handle('get-plugin-memory-info', async (_event, pluginPath: string) => {
      try {
        const memoryInfo = await this.pluginManager?.getPluginMemoryInfo(pluginPath)
        return { success: true, data: memoryInfo }
      } catch (error: unknown) {
        console.error('[Plugins] 获取插件内存信息失败:', error)
        return { success: false, error: error instanceof Error ? error.message : '获取失败' }
      }
    })

    ipcMain.handle(
      'install-plugin-from-npm',
      (_event, options: { packageName: string; useChinaMirror?: boolean }) =>
        this.installPluginFromNpm(options.packageName, options.useChinaMirror)
    )
  }

  // 获取插件列表（过滤掉内置插件，用于插件中心显示）
  public async getPlugins(): Promise<any[]> {
    const allPlugins = await this.getAllPlugins()
    // 过滤掉所有内置插件（system、setting 等）
    return allPlugins.filter((plugin: any) => !isInternalPlugin(plugin.name))
  }

  // 获取所有插件列表（包括 system 插件，用于生成搜索指令）
  public async getAllPlugins(): Promise<any[]> {
    try {
      const data = databaseAPI.dbGet('plugins')
      const plugins = data || []

      // 合并动态 features 和网页快开搜索引擎
      const webSearchFeatures = await webSearchAPI.getSearchEngineFeatures()
      for (const plugin of plugins) {
        const dynamicFeatures = pluginFeatureAPI.loadDynamicFeatures(plugin.name)
        plugin.features = [...(plugin.features || []), ...dynamicFeatures]

        // 将网页快开搜索引擎作为系统插件的动态 features
        if (plugin.name === 'system' && webSearchFeatures.length > 0) {
          plugin.features = [...plugin.features, ...webSearchFeatures]
        }

        // 处理插件 logo 路径
        if (plugin.logo) {
          plugin.logo = normalizeIconPath(plugin.logo, plugin.path)
        }

        // 处理每个 feature 的 icon 路径
        if (plugin.features && Array.isArray(plugin.features)) {
          for (const feature of plugin.features) {
            if (feature.icon) {
              feature.icon = normalizeIconPath(feature.icon, plugin.path)
            }
          }
        }
      }

      return plugins
    } catch (error) {
      console.error('[Plugins] 获取插件列表失败:', error)
      return []
    }
  }

  /**
   * 验证插件配置
   * @param pluginConfig 插件配置对象
   * @param existingPlugins 已存在的插件列表
   * @returns 验证结果 { valid: boolean, error?: string }
   */
  private validatePluginConfig(
    pluginConfig: any,
    existingPlugins: any[]
  ): { valid: boolean; error?: string } {
    // 检查 title 是否冲突（如果有 title 字段）
    if (pluginConfig.title) {
      const titleConflict = existingPlugins.find((p: any) => p.title === pluginConfig.title)
      if (titleConflict) {
        return {
          valid: false,
          error: `插件标题 "${pluginConfig.title}" 已被插件 "${titleConflict.name}" 使用，请使用不同的标题`
        }
      }
    }

    // 校验必填字段
    const requiredFields = ['name', 'version', 'features']
    for (const field of requiredFields) {
      if (!pluginConfig[field]) {
        return { valid: false, error: `缺少必填字段: ${field}` }
      }
    }

    // 校验 features 数组
    if (!Array.isArray(pluginConfig.features) || pluginConfig.features.length === 0) {
      return { valid: false, error: 'features 必须是非空数组' }
    }

    // 校验每个 feature 的字段
    for (const feature of pluginConfig.features) {
      if (!feature.code || !Array.isArray(feature.cmds)) {
        return { valid: false, error: 'feature 缺少必填字段 (code, cmds)' }
      }
    }

    return { valid: true }
  }

  /**
   * 选择插件文件（不安装，仅返回文件路径）
   * 用于导入本地插件时先预览再安装
   * 注意：此方法通过 internal:select-plugin-file 调用
   */
  public async selectPluginFile(): Promise<any> {
    try {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        title: '选择插件文件',
        filters: [{ name: '插件文件', extensions: ['zpx'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '未选择文件' }
      }

      return { success: true, filePath: result.filePaths[0] }
    } catch (error: unknown) {
      console.error('[Plugins] 选择插件文件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  // 导入 ZPX 插件（保留用于兼容性，直接安装不预览）
  private async importPlugin(): Promise<any> {
    try {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        title: '选择插件文件',
        filters: [{ name: '插件文件', extensions: ['zpx'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '未选择文件' }
      }

      const zpxPath = result.filePaths[0]
      return await this._installPluginFromZpx(zpxPath)
    } catch (error: unknown) {
      console.error('[Plugins] 导入插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  /**
   * 从 ZPX 安装插件（核心逻辑）
   * 流程：读取 .zpx 中的 plugin.json → 校验 → 解压到插件目录 → 保存数据库
   * @param zpxPath .zpx 文件路径
   */
  private async _installPluginFromZpx(zpxPath: string): Promise<any> {
    await fs.mkdir(PLUGIN_DIR, { recursive: true })

    try {
      // 从 ZPX 中读取 plugin.json（不解压整个包）
      let pluginJsonContent: string
      try {
        pluginJsonContent = await readTextFromZpx(zpxPath, 'plugin.json')
      } catch {
        return { success: false, error: 'plugin.json 文件不存在' }
      }

      if (!pluginJsonContent) {
        return { success: false, error: 'plugin.json 文件不存在' }
      }

      // 解析配置
      let pluginConfig: any
      try {
        pluginConfig = JSON.parse(pluginJsonContent)
      } catch {
        return { success: false, error: 'plugin.json 格式错误' }
      }

      // 校验必填字段
      if (!pluginConfig.name) {
        return { success: false, error: 'plugin.json 缺少 name 字段' }
      }

      const pluginName = pluginConfig.name
      const pluginPath = path.join(PLUGIN_DIR, pluginName)

      // 检查目录是否已存在
      try {
        await fs.access(pluginPath)
        return { success: false, error: '插件目录已存在' }
      } catch {
        // 不存在，继续
      }

      // 检查插件是否已存在
      const existingPlugins = await this.getPlugins()
      if (existingPlugins.some((p: any) => p.name === pluginName)) {
        return { success: false, error: '插件已存在' }
      }

      // 验证插件配置
      const validation = this.validatePluginConfig(pluginConfig, existingPlugins)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // 校验通过，解压 ZPX 到目标目录
      await extractZpx(zpxPath, pluginPath)

      // 保存到数据库
      const pluginInfo = {
        name: pluginConfig.name,
        title: pluginConfig.title,
        version: pluginConfig.version,
        description: pluginConfig.description || '',
        author: pluginConfig.author || '',
        homepage: pluginConfig.homepage || '',
        logo: pluginConfig.logo ? pathToFileURL(path.join(pluginPath, pluginConfig.logo)).href : '',
        main: pluginConfig.main,
        preload: pluginConfig.preload,
        features: pluginConfig.features,
        path: pluginPath,
        isDevelopment: false,
        installedAt: new Date().toISOString()
      }

      let plugins: any = databaseAPI.dbGet('plugins')
      if (!plugins) plugins = []
      plugins.push(pluginInfo)
      databaseAPI.dbPut('plugins', plugins)

      // 输出新增的指令
      console.log('[Plugins] \n=== 新增插件指令 ===')
      console.log(`插件名称: ${pluginConfig.name}`)
      console.log(`插件版本: ${pluginConfig.version}`)
      console.log('[Plugins] 新增指令列表:')
      pluginConfig.features.forEach((feature: any, index: number) => {
        console.log(`  [${index + 1}] ${feature.code} - ${feature.explain || '无说明'}`)

        // 格式化 cmds（区分字符串和对象）
        const formattedCmds = feature.cmds
          .map((cmd: any) => {
            if (typeof cmd === 'string') {
              return cmd
            } else if (typeof cmd === 'object' && cmd !== null) {
              // 对象类型的匹配指令
              const type = cmd.type || 'unknown'
              const label = cmd.label || type
              return `[${type}] ${label}`
            }
            return String(cmd)
          })
          .join(', ')

        console.log(`      关键词: ${formattedCmds}`)
      })
      console.log('[Plugins] ==================\n')

      this.mainWindow?.webContents.send('plugins-changed')
      return { success: true, plugin: pluginInfo }
    } catch (error: unknown) {
      console.error('[Plugins] 安装插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '安装失败' }
    }
  }

  /**
   * 从 ZIP 安装插件（兼容旧格式）
   * 用于市场下载的旧 ZIP 格式插件，过渡期结束后移除
   * @param zipPath .zip 文件路径
   */
  private async _installPluginFromZip(zipPath: string): Promise<any> {
    await fs.mkdir(PLUGIN_DIR, { recursive: true })

    try {
      const zip = new AdmZip(zipPath)
      const pluginJsonEntry = zip.readAsText('plugin.json')
      if (!pluginJsonEntry) {
        return { success: false, error: 'plugin.json 文件不存在' }
      }

      let pluginConfig: any
      try {
        pluginConfig = JSON.parse(pluginJsonEntry)
      } catch {
        return { success: false, error: 'plugin.json 格式错误' }
      }

      if (!pluginConfig.name) {
        return { success: false, error: 'plugin.json 缺少 name 字段' }
      }

      const pluginName = pluginConfig.name
      const pluginPath = path.join(PLUGIN_DIR, pluginName)

      try {
        await fs.access(pluginPath)
        return { success: false, error: '插件目录已存在' }
      } catch {
        // 不存在，继续
      }

      const existingPlugins = await this.getPlugins()
      const validation = this.validatePluginConfig(pluginConfig, existingPlugins)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // ZIP 解压到目标目录
      zip.extractAllTo(pluginPath, true)

      const pluginInfo = {
        name: pluginConfig.name,
        title: pluginConfig.title,
        version: pluginConfig.version,
        description: pluginConfig.description || '',
        author: pluginConfig.author || '',
        homepage: pluginConfig.homepage || '',
        logo: pluginConfig.logo ? pathToFileURL(path.join(pluginPath, pluginConfig.logo)).href : '',
        main: pluginConfig.main,
        preload: pluginConfig.preload,
        features: pluginConfig.features,
        path: pluginPath,
        isDevelopment: false,
        installedAt: new Date().toISOString()
      }

      let plugins: any = databaseAPI.dbGet('plugins')
      if (!plugins) plugins = []
      plugins.push(pluginInfo)
      databaseAPI.dbPut('plugins', plugins)

      console.log('[Plugins] ZIP 兼容安装完成:', pluginName)
      this.mainWindow?.webContents.send('plugins-changed')
      return { success: true, plugin: pluginInfo }
    } catch (error: unknown) {
      console.error('[Plugins] ZIP 兼容安装失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '安装失败' }
    }
  }

  /**
   * 从 ZPX 文件中读取插件信息（不安装）
   * 用于安装前预览插件详情
   * @param zpxPath .zpx 文件路径
   */
  public async readPluginInfoFromZpx(zpxPath: string): Promise<any> {
    try {
      // 从 ZPX 中读取 plugin.json
      let pluginJsonContent: string
      try {
        pluginJsonContent = await readTextFromZpx(zpxPath, 'plugin.json')
      } catch {
        return { success: false, error: '无效的插件文件：缺少 plugin.json' }
      }

      let pluginConfig: any
      try {
        pluginConfig = JSON.parse(pluginJsonContent)
      } catch {
        return { success: false, error: '无效的插件文件：plugin.json 格式错误' }
      }

      if (!pluginConfig.name) {
        return { success: false, error: '无效的插件文件：缺少 name 字段' }
      }

      // 尝试从 ZPX 中提取 logo 为 base64
      let logoBase64 = ''
      if (pluginConfig.logo) {
        try {
          const logoBuffer = await readFileFromZpx(zpxPath, pluginConfig.logo)
          const ext = path.extname(pluginConfig.logo).toLowerCase().replace('.', '')
          const mimeType =
            ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : `image/${ext}`
          logoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`
        } catch (error) {
          console.warn('[Plugins] 提取插件 logo 失败:', error)
        }
      }

      // 检查插件是否已安装
      const existingPlugins = await this.getPlugins()
      const isInstalled = existingPlugins.some((p: any) => p.name === pluginConfig.name)

      return {
        success: true,
        pluginInfo: {
          name: pluginConfig.name,
          title: pluginConfig.title || pluginConfig.name,
          version: pluginConfig.version || '未知',
          description: pluginConfig.description || '',
          author: pluginConfig.author || '未知',
          logo: logoBase64,
          features: pluginConfig.features || [],
          isInstalled
        }
      }
    } catch (error: unknown) {
      console.error('[Plugins] 读取插件信息失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '读取失败' }
    }
  }

  /**
   * 从指定文件路径安装插件（.zpx），支持覆盖已存在的插件
   * @param zpxPath .zpx 文件路径
   */
  public async installPluginFromPath(zpxPath: string): Promise<any> {
    try {
      // 从 ZPX 中读取 plugin.json 获取插件名称
      let pluginJsonContent: string
      try {
        pluginJsonContent = await readTextFromZpx(zpxPath, 'plugin.json')
      } catch {
        return { success: false, error: 'plugin.json 文件不存在' }
      }

      let pluginConfig: any
      try {
        pluginConfig = JSON.parse(pluginJsonContent)
      } catch {
        return { success: false, error: 'plugin.json 格式错误' }
      }

      if (!pluginConfig.name) {
        return { success: false, error: 'plugin.json 缺少 name 字段' }
      }

      const pluginName = pluginConfig.name
      const pluginPath = path.join(PLUGIN_DIR, pluginName)

      // 检查是否已存在，如果存在则先删除旧版本（覆盖安装）
      const existingPlugins: any[] = databaseAPI.dbGet('plugins') || []
      const existingIndex = existingPlugins.findIndex((p: any) => p.name === pluginName)

      if (existingIndex !== -1) {
        console.log('[Plugins] 插件已存在，执行覆盖安装:', pluginName)

        // 终止正在运行的插件
        try {
          await this.pluginManager?.killPluginByName?.(pluginName)
        } catch {
          // 忽略终止错误
        }

        // 从数据库中移除旧记录
        existingPlugins.splice(existingIndex, 1)
        databaseAPI.dbPut('plugins', existingPlugins)

        // 删除旧目录
        try {
          await fs.rm(pluginPath, { recursive: true, force: true })
          console.log('[Plugins] 已删除旧插件目录:', pluginPath)
        } catch {
          // 忽略删除错误
        }
      }

      // 执行安装
      return await this._installPluginFromZpx(zpxPath)
    } catch (error: unknown) {
      console.error('[Plugins] 覆盖安装插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '安装失败' }
    }
  }

  // 导入开发中插件
  private async importDevPlugin(pluginJsonPath?: string): Promise<any> {
    try {
      // 如果没有传入路径，通过对话框选择
      if (!pluginJsonPath) {
        const result = await dialog.showOpenDialog(this.mainWindow!, {
          title: '选择插件配置文件',
          properties: ['openFile'],
          filters: [{ name: '插件配置', extensions: ['json'] }],
          message: '请选择 plugin.json 文件'
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, error: '未选择文件' }
        }

        pluginJsonPath = result.filePaths[0]
      }

      // 检查文件名是否为 plugin.json
      if (path.basename(pluginJsonPath) !== 'plugin.json') {
        return { success: false, error: '请选择 plugin.json 文件' }
      }

      // 获取插件文件夹路径（plugin.json 所在的目录）
      const pluginPath = path.dirname(pluginJsonPath)

      const pluginJsonContent = await fs.readFile(pluginJsonPath, 'utf-8')
      let pluginConfig: any
      try {
        pluginConfig = JSON.parse(pluginJsonContent)
      } catch {
        return { success: false, error: 'plugin.json 格式错误' }
      }

      if (!pluginConfig.name) {
        return { success: false, error: 'plugin.json 缺少 name 字段' }
      }

      const existingPlugins = await this.getPlugins()
      if (existingPlugins.some((p: any) => p.name === pluginConfig.name)) {
        return { success: false, error: '插件已存在' }
      }

      // 验证插件配置
      const validation = this.validatePluginConfig(pluginConfig, existingPlugins)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      const pluginInfo = {
        name: pluginConfig.name,
        title: pluginConfig.title,
        version: pluginConfig.version,
        description: pluginConfig.description || '',
        author: pluginConfig.author || '',
        homepage: pluginConfig.homepage || '',
        logo: pluginConfig.logo ? pathToFileURL(path.join(pluginPath, pluginConfig.logo)).href : '',
        main: pluginConfig?.development?.main,
        preload: pluginConfig.preload,
        features: pluginConfig.features,
        path: pluginPath,
        isDevelopment: true,
        installedAt: new Date().toISOString()
      }

      let plugins: any = databaseAPI.dbGet('plugins')
      if (!plugins) plugins = []
      plugins.push(pluginInfo)
      databaseAPI.dbPut('plugins', plugins)

      // 输出新增的指令
      console.log('[Plugins] \n=== 新增开发中插件指令 ===')
      console.log(`插件名称: ${pluginConfig.name}`)
      console.log(`插件版本: ${pluginConfig.version}`)
      console.log(`开发模式: ${pluginConfig.development?.main || '无'}`)
      console.log('[Plugins] 新增指令列表:')
      pluginConfig.features.forEach((feature: any, index: number) => {
        console.log(`  [${index + 1}] ${feature.code} - ${feature.explain || '无说明'}`)

        // 格式化 cmds（区分字符串和对象）
        const formattedCmds = feature.cmds
          .map((cmd: any) => {
            if (typeof cmd === 'string') {
              return cmd
            } else if (typeof cmd === 'object' && cmd !== null) {
              // 对象类型的匹配指令
              const type = cmd.type || 'unknown'
              const label = cmd.label || type
              return `[${type}] ${label}`
            }
            return String(cmd)
          })
          .join(', ')

        console.log(`      关键词: ${formattedCmds}`)
      })
      console.log('[Plugins] =========================\n')

      this.mainWindow?.webContents.send('plugins-changed')
      return { success: true }
    } catch (error: unknown) {
      console.error('[Plugins] 添加开发中插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  // 删除插件
  private async deletePlugin(pluginPath: string): Promise<any> {
    try {
      const plugins: any = databaseAPI.dbGet('plugins')
      if (!plugins || !Array.isArray(plugins)) {
        return { success: false, error: '插件列表不存在' }
      }

      const pluginIndex = plugins.findIndex((p: any) => p.path === pluginPath)
      if (pluginIndex === -1) {
        return { success: false, error: '插件不存在' }
      }

      const pluginInfo = plugins[pluginIndex]

      // ✅ 检查是否为内置插件
      if (isInternalPlugin(pluginInfo.name)) {
        return {
          success: false,
          error: '内置插件不能卸载'
        }
      }

      plugins.splice(pluginIndex, 1)
      databaseAPI.dbPut('plugins', plugins)

      this.mainWindow?.webContents.send('plugins-changed')

      if (!pluginInfo.isDevelopment) {
        try {
          await fs.rm(pluginPath, { recursive: true, force: true })
          console.log('[Plugins] 已删除插件目录:', pluginPath)
        } catch (error) {
          console.error('[Plugins] 删除插件目录失败:', error)
        }
      } else {
        console.log('[Plugins] 开发中插件，保留目录:', pluginPath)
      }

      return { success: true }
    } catch (error: unknown) {
      console.error('[Plugins] 删除插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  // 重载插件
  private async reloadPlugin(pluginPath: string): Promise<any> {
    try {
      const plugins: any = databaseAPI.dbGet('plugins')
      if (!plugins || !Array.isArray(plugins)) {
        return { success: false, error: '插件列表不存在' }
      }

      const pluginIndex = plugins.findIndex((p: any) => p.path === pluginPath)
      if (pluginIndex === -1) {
        return { success: false, error: '插件不存在' }
      }

      const oldPlugin = plugins[pluginIndex]
      const pluginJsonPath = path.join(pluginPath, 'plugin.json')

      try {
        await fs.access(pluginJsonPath)
      } catch (error) {
        console.log('[Plugins] 文件不存在', error)
        return { success: false, error: 'plugin.json 文件不存在' }
      }

      const pluginJsonContent = await fs.readFile(pluginJsonPath, 'utf-8')
      const pluginConfig = JSON.parse(pluginJsonContent)

      plugins[pluginIndex] = {
        ...oldPlugin,
        title: pluginConfig.title || oldPlugin.title,
        name: pluginConfig.name || oldPlugin.name,
        version: pluginConfig.version || oldPlugin.version,
        description: pluginConfig.description || oldPlugin.description,
        author: pluginConfig.author ?? oldPlugin.author,
        homepage: pluginConfig.homepage ?? oldPlugin.homepage,
        logo: pluginConfig.logo
          ? pathToFileURL(path.join(pluginPath, pluginConfig.logo)).href
          : oldPlugin.logo,
        features: pluginConfig.features || oldPlugin.features,
        main: pluginConfig.main || oldPlugin.main
      }

      databaseAPI.dbPut('plugins', plugins)
      this.mainWindow?.webContents.send('plugins-changed')
      console.log('[Plugins] 插件重载成功:', pluginPath)
      return { success: true }
    } catch (error: unknown) {
      console.error('[Plugins] 重载插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  // 获取运行中的插件
  private getRunningPlugins(): string[] {
    if (this.pluginManager) {
      return this.pluginManager.getRunningPlugins()
    }
    return []
  }

  // 终止插件
  private killPlugin(pluginPath: string): { success: boolean; error?: string } {
    try {
      console.log('[Plugins] 终止插件:', pluginPath)
      if (this.pluginManager) {
        const result = this.pluginManager.killPlugin(pluginPath)
        if (result) {
          return { success: true }
        } else {
          return { success: false, error: '插件未运行' }
        }
      }
      return { success: false, error: '功能不可用' }
    } catch (error: unknown) {
      console.error('[Plugins] 终止插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  // 终止插件并返回搜索页面
  private killPluginAndReturn(pluginPath: string): { success: boolean; error?: string } {
    try {
      console.log('[Plugins] 终止插件并返回搜索页面:', pluginPath)
      if (this.pluginManager) {
        const result = this.pluginManager.killPlugin(pluginPath)
        if (result) {
          windowManager.notifyBackToSearch()
          this.mainWindow?.webContents.focus()
          return { success: true }
        } else {
          return { success: false, error: '插件未运行' }
        }
      }
      return { success: false, error: '功能不可用' }
    } catch (error: unknown) {
      console.error('[Plugins] 终止插件并返回搜索页面失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  // 获取插件市场列表
  private async fetchPluginMarket(): Promise<any> {
    try {
      // 读取设置，检查是否有自定义插件市场 URL
      const settings = databaseAPI.dbGet('settings-general')
      const defaultBaseUrl =
        'https://github.com/ZToolsCenter/ZTools-plugins/releases/latest/download'
      let baseUrl = defaultBaseUrl

      if (settings?.pluginMarketCustom && settings?.pluginMarketUrl) {
        baseUrl = settings.pluginMarketUrl.replace(/\/+$/, '') // 去除末尾斜杠
      }

      // 从 OSS 获取 plugins.json
      const pluginsJsonUrl = `${baseUrl}/plugins.json`
      const latestVersionUrl = `${baseUrl}/latest`

      console.log('[Plugins] 从插件市场获取列表...', baseUrl)

      // 生成时间戳，用于禁用缓存
      const timestamp = Date.now()

      // 获取最新版本号（格式：2026.01.17.1337）
      let latestVersion = ''
      try {
        // 添加时间戳参数，确保每次都获取最新版本（httpGet 已默认禁用缓存）
        const versionResponse = await httpGet(`${latestVersionUrl}?t=${timestamp}`)
        latestVersion = versionResponse.data.trim()
        console.log(`发现最新插件列表版本: ${latestVersion}`)
      } catch (error) {
        console.warn('[Plugins] 获取版本号失败，将强制更新:', error)
      }

      // 检查缓存
      const cachedVersion = databaseAPI.dbGet('plugin-market-version')
      const cachedData = databaseAPI.dbGet('plugin-market-data')

      if (cachedVersion === latestVersion && cachedData && latestVersion) {
        console.log('[Plugins] 使用本地缓存的插件市场列表')
        return { success: true, data: cachedData }
      }

      // 下载 plugins.json（添加时间戳，httpGet 已默认禁用缓存）
      console.log('[Plugins] 下载新版本插件列表...')
      const response = await httpGet(`${pluginsJsonUrl}?t=${timestamp}`)
      const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data

      // 保存到缓存
      databaseAPI.dbPut('plugin-market-version', latestVersion)
      databaseAPI.dbPut('plugin-market-data', json)

      return { success: true, data: json }
    } catch (error: unknown) {
      console.error('[Plugins] 获取插件市场列表失败:', error)
      try {
        const cachedData = databaseAPI.dbGet('plugin-market-data')
        if (cachedData) {
          console.log('[Plugins] 获取失败，降级使用本地缓存')
          return { success: true, data: cachedData }
        }
      } catch {
        // ignore
      }
      return { success: false, error: error instanceof Error ? error.message : '获取失败' }
    }
  }

  /**
   * 从市场安装插件
   * 流程：下载 .zpx 文件 → _installPluginFromZpx() → 清理临时文件
   */
  private async installPluginFromMarket(plugin: any): Promise<any> {
    try {
      console.log('[Plugins] 开始从市场安装插件:', plugin.name)
      const downloadUrl = plugin.downloadUrl
      if (!downloadUrl) {
        return { success: false, error: '无效的下载链接' }
      }

      console.log('[Plugins] 插件下载链接:', downloadUrl)

      const tempDir = path.join(app.getPath('temp'), 'ztools-plugin-download')
      await fs.mkdir(tempDir, { recursive: true })
      // 下载为 .zpx 后缀
      const tempFilePath = path.join(tempDir, `${plugin.name}-${Date.now()}.zpx`)

      let retryCount = 0
      const maxRetries = 3
      while (retryCount < maxRetries) {
        try {
          await downloadFile(downloadUrl, tempFilePath)
          break
        } catch (error) {
          retryCount++
          console.error(`下载失败，重试第 ${retryCount} 次:`, error)
          if (retryCount >= maxRetries) throw error
          await sleep(500)
        }
      }

      console.log('[Plugins] 插件下载完成:', tempFilePath)
      // 自动检测格式：ZPX（gzip）或 ZIP（旧格式兼容）
      const isZpx = await isValidZpx(tempFilePath)
      const result = isZpx
        ? await this._installPluginFromZpx(tempFilePath)
        : await this._installPluginFromZip(tempFilePath)
      console.log(`[Plugins] 市场插件格式: ${isZpx ? 'ZPX' : 'ZIP（兼容）'}`)

      try {
        await fs.unlink(tempFilePath)
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch (e) {
        console.error('[Plugins] 清理下载临时文件失败:', e)
      }

      return result
    } catch (error: unknown) {
      console.error('[Plugins] 从市场安装插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '安装失败' }
    }
  }

  /**
   * 打包开发中插件为 ZPX 文件
   * 流程：插件目录 → packZpx() → .zpx 文件
   * @param pluginPath 插件目录路径
   */
  public async packagePlugin(pluginPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 查找插件信息
      const plugins: any = databaseAPI.dbGet('plugins')
      if (!plugins || !Array.isArray(plugins)) {
        return { success: false, error: '插件列表不存在' }
      }

      const pluginInfo = plugins.find((p: any) => p.path === pluginPath)
      if (!pluginInfo) {
        return { success: false, error: '插件不存在' }
      }

      if (!pluginInfo.isDevelopment) {
        return { success: false, error: '仅支持打包开发中的插件' }
      }

      // 检查插件目录是否存在
      try {
        await fs.access(pluginPath)
      } catch {
        return { success: false, error: '插件目录不存在' }
      }

      // 默认文件名使用 .zpx 扩展名
      const defaultName = `${pluginInfo.name}-v${pluginInfo.version}.zpx`

      // 弹出保存对话框
      const result = await dialog.showSaveDialog(this.mainWindow!, {
        title: '保存插件包',
        defaultPath: defaultName,
        filters: [{ name: '插件包', extensions: ['zpx'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: '已取消' }
      }

      // 使用 zpxArchive 打包
      await packZpx(pluginPath, result.filePath)

      // 打开文件管理器并选中打包后的文件
      shell.showItemInFolder(result.filePath)

      console.log('[Plugins] 插件打包成功:', result.filePath)
      return { success: true }
    } catch (error: unknown) {
      console.error('[Plugins] 打包插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '打包失败' }
    }
  }

  // 获取插件 README.md 内容
  private async getPluginReadme(
    pluginPathOrName: string,
    pluginName?: string
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      // 如果 pluginPathOrName 是一个路径（包含 / 或 \），则读取本地文件
      if (pluginPathOrName.includes('/') || pluginPathOrName.includes('\\')) {
        return await this.getLocalPluginReadme(pluginPathOrName)
      }

      // 否则当作插件名称，从远程加载
      const name = pluginName || pluginPathOrName
      return await this.getRemotePluginReadme(name)
    } catch (error: unknown) {
      console.error('[Plugins] 读取插件 README 失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '读取失败' }
    }
  }

  // 读取本地插件 README
  private async getLocalPluginReadme(
    pluginPath: string
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      // 尝试不同的 README 文件名（大小写不敏感）
      const possibleReadmeFiles = ['README.md', 'readme.md', 'Readme.md', 'README.MD']

      for (const filename of possibleReadmeFiles) {
        const readmePath = path.join(pluginPath, filename)
        try {
          let content = await fs.readFile(readmePath, 'utf-8')

          // 将插件路径转换为 file:// URL（跨平台兼容）
          const pluginPathUrl = pathToFileURL(pluginPath).href

          // 替换 Markdown 图片语法：![alt](path)
          content = content.replace(
            /!\[([^\]]*)\]\((?!http|file:)([^)]+)\)/g,
            (_match, alt, imgPath) => {
              const cleanPath = imgPath.replace(/^\.\//, '')
              return `![${alt}](${pluginPathUrl}/${cleanPath})`
            }
          )

          // 替换 HTML img 标签的 src 属性
          content = content.replace(
            /<img([^>]*?)src=["'](?!http|file:)([^"']+)["']([^>]*?)>/gi,
            (_match, before, src, after) => {
              const cleanSrc = src.replace(/^\.\//, '')
              return `<img${before}src="${pluginPathUrl}/${cleanSrc}"${after}>`
            }
          )

          // 替换 Markdown 链接语法（排除锚点链接 #）
          content = content.replace(
            /\[([^\]]+)\]\((?!http|file:|#)([^)]+)\)/g,
            (_match, text, linkPath) => {
              const cleanPath = linkPath.replace(/^\.\//, '')
              return `[${text}](${pluginPathUrl}/${cleanPath})`
            }
          )

          // 替换 HTML a 标签的 href 属性（排除锚点链接和外部链接）
          content = content.replace(
            /<a([^>]*?)href=["'](?!http|file:|#)([^"']+)["']([^>]*?)>/gi,
            (_match, before, href, after) => {
              const cleanHref = href.replace(/^\.\//, '')
              return `<a${before}href="${pluginPathUrl}/${cleanHref}"${after}>`
            }
          )

          return { success: true, content }
        } catch {
          // 继续尝试下一个文件名
          continue
        }
      }

      // 所有文件名都不存在
      return { success: false, error: '暂无详情' }
    } catch (error: unknown) {
      console.error('[Plugins] 读取本地插件 README 失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '读取失败' }
    }
  }

  // 从远程加载插件 README
  private async getRemotePluginReadme(
    pluginName: string
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      const baseUrl = `https://raw.githubusercontent.com/ZToolsCenter/ZTools-plugins/main/plugins/${pluginName}`
      const readmeUrl = `${baseUrl}/README.md`

      console.log('[Plugins] 从远程加载 README:', readmeUrl)

      // 使用 httpGet 获取 README 内容（走系统代理）
      const response = await httpGet(readmeUrl, {
        validateStatus: (status) => status >= 200 && status < 400
      })
      if (response.status >= 300) {
        return { success: false, error: '暂无详情' }
      }

      let content =
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

      // 替换 Markdown 图片语法：![alt](path)
      content = content.replace(/!\[([^\]]*)\]\((?!http)([^)]+)\)/g, (_match, alt, path) => {
        const cleanPath = path.replace(/^\.\//, '')
        return `![${alt}](${baseUrl}/${cleanPath})`
      })

      // 替换 HTML img 标签的 src 属性
      content = content.replace(
        /<img([^>]*?)src=["'](?!http)([^"']+)["']([^>]*?)>/gi,
        (_match, before, src, after) => {
          const cleanSrc = src.replace(/^\.\//, '')
          return `<img${before}src="${baseUrl}/${cleanSrc}"${after}>`
        }
      )

      // 替换 Markdown 链接语法（排除锚点链接 #）
      content = content.replace(/\[([^\]]+)\]\((?!http|#)([^)]+)\)/g, (_match, text, path) => {
        const cleanPath = path.replace(/^\.\//, '')
        return `[${text}](${baseUrl}/${cleanPath})`
      })

      // 替换 HTML a 标签的 href 属性（排除锚点链接和外部链接）
      content = content.replace(
        /<a([^>]*?)href=["'](?!http|#)([^"']+)["']([^>]*?)>/gi,
        (_match, before, href, after) => {
          const cleanHref = href.replace(/^\.\//, '')
          return `<a${before}href="${baseUrl}/${cleanHref}"${after}>`
        }
      )

      return { success: true, content }
    } catch (error: unknown) {
      console.error('[Plugins] 从远程加载插件 README 失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '加载失败' }
    }
  }

  // 获取插件存储的数据库数据
  private getPluginDbData(pluginName: string): { success: boolean; data?: any; error?: string } {
    try {
      // 获取以插件名为前缀的所有数据
      const prefix = `PLUGIN/${pluginName}/`
      const allData = lmdbInstance.allDocs(prefix)

      if (!allData || allData.length === 0) {
        return { success: true, data: [] }
      }

      // 过滤并格式化数据
      const formattedData = allData.map((item: any) => ({
        id: item._id.substring(prefix.length), // 去除前缀
        data: item.data,
        rev: item._rev,
        updatedAt: item.updatedAt || item._updatedAt
      }))

      return { success: true, data: formattedData }
    } catch (error: unknown) {
      console.error('[Plugins] 获取插件数据失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '获取失败' }
    }
  }

  /**
   * 从 npm 安装插件
   * @param packageName npm 包名（支持作用域包，如 @ztools/example）
   * @param useChinaMirror 是否使用国内镜像（默认 false）
   */
  private async installPluginFromNpm(packageName: string, useChinaMirror = false): Promise<any> {
    try {
      console.log('[Plugins] 开始从 npm 安装插件:', packageName)

      // 1. 从 npm registry 获取包信息
      const registryBase = useChinaMirror
        ? 'https://registry.npmmirror.com'
        : 'https://registry.npmjs.org'
      const registryUrl = `${registryBase}/${packageName}`
      console.log('[Plugins] 获取包信息:', registryUrl, useChinaMirror ? '(国内镜像)' : '')

      let packageInfo: any
      try {
        const response = await httpGet(registryUrl)
        packageInfo = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
      } catch (error) {
        console.error('[Plugins] 获取包信息失败:', error)
        return { success: false, error: '无法获取包信息，请检查包名是否正确' }
      }

      // 2. 获取最新版本的 tarball URL
      const latestVersion = packageInfo['dist-tags']?.latest
      if (!latestVersion) {
        return { success: false, error: '无法获取最新版本信息' }
      }

      const versionInfo = packageInfo.versions?.[latestVersion]
      if (!versionInfo) {
        return { success: false, error: '无法获取版本详情' }
      }

      const tarballUrl = versionInfo.dist?.tarball
      if (!tarballUrl) {
        return { success: false, error: '无法获取下载链接' }
      }

      console.log('[Plugins] 最新版本:', latestVersion)
      console.log('[Plugins] Tarball URL:', tarballUrl)

      // 3. 创建临时目录并下载 tarball
      const tempDir = path.join(app.getPath('temp'), 'ztools-npm-download')
      await fs.mkdir(tempDir, { recursive: true })

      const tarballPath = path.join(tempDir, `${Date.now()}.tgz`)
      console.log('[Plugins] 下载 tarball 到:', tarballPath)

      let retryCount = 0
      const maxRetries = 3
      while (retryCount < maxRetries) {
        try {
          await downloadFile(tarballUrl, tarballPath)
          break
        } catch (error) {
          retryCount++
          console.error(`下载失败，重试第 ${retryCount} 次:`, error)
          if (retryCount >= maxRetries) throw error
          await sleep(500)
        }
      }

      // 4. 解压 tarball 到临时目录
      const extractDir = path.join(tempDir, `extract-${Date.now()}`)
      await fs.mkdir(extractDir, { recursive: true })

      console.log('[Plugins] 解压 tarball 到:', extractDir)
      await tar.extract({
        file: tarballPath,
        cwd: extractDir
      })

      // 5. npm tarball 的内容在 package/ 目录下
      const packageDir = path.join(extractDir, 'package')
      const pluginJsonPath = path.join(packageDir, 'plugin.json')

      // 6. 检查 plugin.json 是否存在
      try {
        await fs.access(pluginJsonPath)
      } catch {
        // 清理临时文件
        await fs.rm(tempDir, { recursive: true, force: true })
        return { success: false, error: '这不是一个有效的 ZTools 插件包（缺少 plugin.json）' }
      }

      // 7. 读取并验证 plugin.json
      const pluginJsonContent = await fs.readFile(pluginJsonPath, 'utf-8')
      let pluginConfig: any
      try {
        pluginConfig = JSON.parse(pluginJsonContent)
      } catch {
        await fs.rm(tempDir, { recursive: true, force: true })
        return { success: false, error: 'plugin.json 格式错误' }
      }

      if (!pluginConfig.name) {
        await fs.rm(tempDir, { recursive: true, force: true })
        return { success: false, error: 'plugin.json 缺少 name 字段' }
      }

      const pluginName = pluginConfig.name
      const targetPath = path.join(PLUGIN_DIR, pluginName)

      // 8. 检查是否已安装（覆盖安装逻辑）
      const existingPlugins: any[] = databaseAPI.dbGet('plugins') || []
      const existingIndex = existingPlugins.findIndex((p: any) => p.name === pluginName)

      if (existingIndex !== -1) {
        console.log('[Plugins] 插件已存在，执行覆盖安装:', pluginName)

        // 终止正在运行的插件
        try {
          await this.pluginManager?.killPluginByName?.(pluginName)
        } catch {
          // 忽略终止错误
        }

        // 从数据库中移除旧记录
        existingPlugins.splice(existingIndex, 1)
        databaseAPI.dbPut('plugins', existingPlugins)

        // 删除旧目录
        try {
          await fs.rm(targetPath, { recursive: true, force: true })
          console.log('[Plugins] 已删除旧插件目录:', targetPath)
        } catch {
          // 忽略删除错误
        }
      }

      // 9. 移动到插件目录
      await fs.mkdir(PLUGIN_DIR, { recursive: true })
      await fs.rename(packageDir, targetPath)

      console.log('[Plugins] 插件已安装到:', targetPath)

      // 10. 验证插件配置
      const validation = this.validatePluginConfig(pluginConfig, existingPlugins)
      if (!validation.valid) {
        // 安装失败，清理目录
        await fs.rm(targetPath, { recursive: true, force: true })
        await fs.rm(tempDir, { recursive: true, force: true })
        return { success: false, error: validation.error }
      }

      // 11. 保存到数据库
      const pluginInfo = {
        name: pluginConfig.name,
        title: pluginConfig.title,
        version: pluginConfig.version,
        description: pluginConfig.description || '',
        author: pluginConfig.author || '',
        homepage: pluginConfig.homepage || '',
        logo: pluginConfig.logo ? pathToFileURL(path.join(targetPath, pluginConfig.logo)).href : '',
        main: pluginConfig.main,
        preload: pluginConfig.preload,
        features: pluginConfig.features,
        path: targetPath,
        isDevelopment: false,
        installedAt: new Date().toISOString(),
        installedFrom: 'npm'
      }

      let plugins: any = databaseAPI.dbGet('plugins')
      if (!plugins) plugins = []
      plugins.push(pluginInfo)
      databaseAPI.dbPut('plugins', plugins)

      // 12. 清理临时文件
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch (e) {
        console.error('[Plugins] 清理临时文件失败:', e)
      }

      // 13. 输出新增的指令
      console.log('[Plugins] \n=== 从 npm 安装插件成功 ===')
      console.log(`npm 包名: ${packageName}`)
      console.log(`插件名称: ${pluginConfig.name}`)
      console.log(`插件版本: ${pluginConfig.version}`)
      console.log('[Plugins] 新增指令列表:')
      pluginConfig.features?.forEach((feature: any, index: number) => {
        console.log(`  [${index + 1}] ${feature.code} - ${feature.explain || '无说明'}`)

        const formattedCmds = feature.cmds
          .map((cmd: any) => {
            if (typeof cmd === 'string') {
              return cmd
            } else if (typeof cmd === 'object' && cmd !== null) {
              const type = cmd.type || 'unknown'
              const label = cmd.label || type
              return `[${type}] ${label}`
            }
            return String(cmd)
          })
          .join(', ')

        console.log(`      关键词: ${formattedCmds}`)
      })
      console.log('[Plugins] =========================\n')

      this.mainWindow?.webContents.send('plugins-changed')
      return { success: true, plugin: pluginInfo }
    } catch (error: unknown) {
      console.error('[Plugins] 从 npm 安装插件失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '安装失败' }
    }
  }
}

export default new PluginsAPI()
