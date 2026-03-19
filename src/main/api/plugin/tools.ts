import { ipcMain, type WebContents } from 'electron'
import fsSync from 'fs'
import path from 'path'
import type { PluginManager } from '../../managers/pluginManager'
import databaseAPI from '../shared/database'

/**
 * 插件在 plugin.json 中声明的工具定义。
 */
export interface DeclaredPluginTool {
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

/**
 * 供 MCP 服务和设置页消费的扁平化工具描述。
 */
export interface DeclaredPluginToolEntry {
  pluginName: string
  pluginPath: string
  pluginLogo?: string
  toolName: string
  mcpName: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  enabled: boolean
}

interface PluginConfigWithTools {
  name?: string
  tools?: Record<string, DeclaredPluginTool>
}

const TOOL_REGISTER_TIMEOUT_MS = 5000
const MCP_DISABLED_PLUGINS_DB_KEY = 'settings-mcp-disabled-plugins'

/**
 * 管理插件工具的声明、注册状态与实际调用。
 */
class PluginToolsAPI {
  private pluginManager: PluginManager | null = null
  // webContents.id => 已通过 ztools.registerTool 注册的工具集合
  private registeredTools = new Map<number, Set<string>>()
  // webContents.id:toolName => 等待工具注册完成的回调列表
  private waiters = new Map<string, Array<() => void>>()

  /**
   * 初始化工具 API，并注册插件工具相关 IPC。
   */
  public init(pluginManager: PluginManager): void {
    this.pluginManager = pluginManager
    this.setupIPC()
  }

  /**
   * 接收 preload 中的工具注册请求，并同步记录到主进程状态。
   */
  private setupIPC(): void {
    ipcMain.on('plugin:tool-register', (event, toolName: string) => {
      try {
        this.registerTool(event.sender, toolName)
        event.returnValue = { success: true }
      } catch (error: unknown) {
        event.returnValue = {
          success: false,
          error: error instanceof Error ? error.message : '工具注册失败'
        }
      }
    })
  }

  /**
   * 从插件目录读取并筛选合法的 tools 声明。
   */
  public getDeclaredToolsByPath(pluginPath: string): Record<string, DeclaredPluginTool> {
    try {
      const pluginJsonPath = path.join(pluginPath, 'plugin.json')
      const pluginConfig = JSON.parse(
        fsSync.readFileSync(pluginJsonPath, 'utf-8')
      ) as PluginConfigWithTools
      if (!pluginConfig.tools || typeof pluginConfig.tools !== 'object') {
        return {}
      }
      return Object.entries(pluginConfig.tools).reduce<Record<string, DeclaredPluginTool>>(
        (acc, [toolName, tool]) => {
          if (
            !tool ||
            typeof tool !== 'object' ||
            typeof tool.description !== 'string' ||
            !tool.inputSchema ||
            typeof tool.inputSchema !== 'object' ||
            Array.isArray(tool.inputSchema)
          ) {
            return acc
          }
          acc[toolName] = tool
          return acc
        },
        {}
      )
    } catch {
      return {}
    }
  }

  /**
   * 根据 WebContents 反查所属插件并读取其 tools 声明。
   */
  public getDeclaredToolsByWebContents(
    webContents: WebContents
  ): Record<string, DeclaredPluginTool> | null {
    const pluginInfo = this.pluginManager?.getPluginInfoByWebContents(webContents)
    if (!pluginInfo) return null
    return this.getDeclaredToolsByPath(pluginInfo.path)
  }

  /**
   * 汇总所有已安装插件的工具，并生成适合 MCP 暴露的唯一工具名。
   */
  public getAllDeclaredToolEntries(options?: {
    includeDisabled?: boolean
  }): DeclaredPluginToolEntry[] {
    const plugins = databaseAPI.dbGet('plugins')
    if (!Array.isArray(plugins)) {
      return []
    }

    const includeDisabled = options?.includeDisabled ?? true
    const disabledPluginPaths = this.getDisabledPluginPaths()
    const usedMcpNames = new Map<string, number>()
    const entries: DeclaredPluginToolEntry[] = []
    for (const plugin of [...plugins].sort((a, b) =>
      String(a?.name || '').localeCompare(String(b?.name || ''))
    )) {
      if (!plugin?.path || !plugin?.name) continue
      const enabled = !disabledPluginPaths.has(plugin.path)
      if (!includeDisabled && !enabled) continue

      const tools = this.getDeclaredToolsByPath(plugin.path)
      for (const [toolName, tool] of Object.entries(tools)) {
        // MCP 工具名需要全局唯一；插件名冲突时通过后缀消解。
        const baseMcpName = this.buildMcpToolName(plugin.name, toolName)
        const collisionCount = usedMcpNames.get(baseMcpName) || 0
        usedMcpNames.set(baseMcpName, collisionCount + 1)
        entries.push({
          pluginName: plugin.name,
          pluginPath: plugin.path,
          pluginLogo: typeof plugin.logo === 'string' ? plugin.logo : undefined,
          toolName,
          mcpName: collisionCount === 0 ? baseMcpName : `${baseMcpName}_${collisionCount + 1}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          enabled
        })
      }
    }
    return entries
  }

  /**
   * 确保目标插件和目标工具已就绪。
   * 插件未运行时会先后台预加载，然后等待 preload 完成 registerTool。
   */
  public async ensurePluginToolReady(
    pluginPath: string,
    toolName: string
  ): Promise<WebContents | null> {
    let webContents = this.pluginManager?.getPluginWebContentsByPath(pluginPath) ?? null
    if (!webContents) {
      await this.pluginManager?.preloadPlugin(pluginPath)
      webContents = this.pluginManager?.getPluginWebContentsByPath(pluginPath) ?? null
    }
    if (!webContents) return null

    if (this.isToolRegistered(webContents, toolName)) {
      return webContents
    }

    // 预加载后的 preload 注册是异步的，这里等待插件完成 registerTool。
    await this.waitForToolRegistration(webContents, toolName)
    return this.isToolRegistered(webContents, toolName) ? webContents : null
  }

  /**
   * 检查某个工具是否已在指定 WebContents 中注册。
   */
  public isToolRegistered(webContents: WebContents, toolName: string): boolean {
    return this.registeredTools.get(webContents.id)?.has(toolName) ?? false
  }

  /**
   * 在插件上下文中执行已注册的工具处理器。
   */
  public async executeRegisteredTool(
    webContents: WebContents,
    toolName: string,
    input: unknown
  ): Promise<unknown> {
    const declaredTools = this.getDeclaredToolsByWebContents(webContents)
    if (!declaredTools?.[toolName]) {
      throw new Error(`工具 "${toolName}" 未在 plugin.json 中声明`)
    }
    if (!this.isToolRegistered(webContents, toolName)) {
      throw new Error(`工具 "${toolName}" 尚未通过 ztools.registerTool 注册`)
    }

    return await webContents.executeJavaScript(`
      (async () => {
        if (!window.ztools || typeof window.ztools.__invokeRegisteredTool !== 'function') {
          throw new Error('插件运行时缺少工具调用入口')
        }
        return await window.ztools.__invokeRegisteredTool(
          ${JSON.stringify(toolName)},
          ${JSON.stringify(input ?? {})}
        )
      })()
    `)
  }

  /**
   * 记录插件工具注册结果，并唤醒等待该工具可用的调用方。
   */
  private registerTool(webContents: WebContents, rawToolName: string): void {
    const toolName = typeof rawToolName === 'string' ? rawToolName.trim() : ''
    if (!toolName) {
      throw new Error('工具名称不能为空')
    }

    const pluginInfo = this.pluginManager?.getPluginInfoByWebContents(webContents)
    if (!pluginInfo) {
      throw new Error('无法获取插件信息')
    }

    const declaredTools = this.getDeclaredToolsByPath(pluginInfo.path)
    if (!declaredTools[toolName]) {
      throw new Error(`工具 "${toolName}" 未在 plugin.json 中声明`)
    }

    let tools = this.registeredTools.get(webContents.id)
    if (!tools) {
      tools = new Set<string>()
      this.registeredTools.set(webContents.id, tools)
      webContents.once('destroyed', () => {
        this.registeredTools.delete(webContents.id)
      })
    }
    tools.add(toolName)
    this.resolveWaiters(webContents.id, toolName)
  }

  /**
   * 等待 preload 中的 registerTool 完成，避免刚预加载时立即调用失败。
   */
  private async waitForToolRegistration(webContents: WebContents, toolName: string): Promise<void> {
    if (this.isToolRegistered(webContents, toolName)) return

    const waiterKey = this.getWaiterKey(webContents.id, toolName)
    await new Promise<void>((resolve, reject) => {
      let wrappedResolve: (() => void) | null = null
      const timeout = setTimeout(() => {
        if (wrappedResolve) {
          this.removeWaiter(waiterKey, wrappedResolve)
        }
        reject(new Error(`等待工具 "${toolName}" 注册超时`))
      }, TOOL_REGISTER_TIMEOUT_MS)

      wrappedResolve = (): void => {
        clearTimeout(timeout)
        resolve()
      }

      const waiters = this.waiters.get(waiterKey) || []
      waiters.push(wrappedResolve)
      this.waiters.set(waiterKey, waiters)
    }).catch(() => undefined)
  }

  /**
   * 解析并执行等待某个工具注册完成的所有回调。
   */
  private resolveWaiters(webContentsId: number, toolName: string): void {
    const waiterKey = this.getWaiterKey(webContentsId, toolName)
    const waiters = this.waiters.get(waiterKey)
    if (!waiters?.length) return

    this.waiters.delete(waiterKey)
    for (const resolve of waiters) {
      resolve()
    }
  }

  /**
   * 在超时或结束后移除单个 waiter，避免残留无效回调。
   */
  private removeWaiter(waiterKey: string, target: () => void): void {
    const waiters = this.waiters.get(waiterKey)
    if (!waiters?.length) return

    const nextWaiters = waiters.filter((waiter) => waiter !== target)
    if (nextWaiters.length > 0) {
      this.waiters.set(waiterKey, nextWaiters)
    } else {
      this.waiters.delete(waiterKey)
    }
  }

  /**
   * 为单个 WebContents + toolName 生成稳定的 waiter 键。
   */
  private getWaiterKey(webContentsId: number, toolName: string): string {
    return `${webContentsId}:${toolName}`
  }

  /**
   * 读取被用户禁用 MCP 工具暴露的插件路径集合。
   */
  private getDisabledPluginPaths(): Set<string> {
    const data = databaseAPI.dbGet(MCP_DISABLED_PLUGINS_DB_KEY)
    return new Set(Array.isArray(data) ? data.filter((item) => typeof item === 'string') : [])
  }

  /**
   * 生成 MCP 对外暴露的工具名，格式为 ztools.plugin.tool。
   */
  private buildMcpToolName(pluginName: string, toolName: string): string {
    const safePluginName =
      pluginName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'plugin'
    return `ztools.${safePluginName}.${toolName}`
  }
}

export default new PluginToolsAPI()
