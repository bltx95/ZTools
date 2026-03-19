import { app } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { randomBytes } from 'crypto'
import pluginToolsAPI from '../api/plugin/tools'
import databaseAPI from '../api/shared/database'

/**
 * MCP 服务持久化配置。
 */
interface McpServerConfig {
  enabled: boolean
  port: number
  apiKey: string
}

/**
 * MCP 当前使用的 JSON-RPC 请求结构。
 */
interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

/**
 * JSON-RPC 响应结构。
 */
interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * 用于把内部路由错误映射为标准 JSON-RPC error。
 */
class McpProtocolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message)
  }
}

const DB_KEY = 'settings-mcp-server'
const DEFAULT_PORT = 36579
const MCP_PROTOCOL_VERSION = '2025-06-18'

/**
 * MCP 服务实现。
 * 当前使用单一 HTTP 端点 `/mcp` 承载 JSON-RPC 2.0 请求。
 */
class McpServer {
  private server: Server | null = null
  private config: McpServerConfig = {
    enabled: false,
    port: DEFAULT_PORT,
    apiKey: ''
  }

  /**
   * 初始化服务配置，并在启用状态下自动启动。
   */
  public async init(): Promise<void> {
    await this.loadConfig()
    if (this.config.enabled) {
      this.start()
    }
  }

  /**
   * 从数据库加载 MCP 服务配置。
   */
  public async loadConfig(): Promise<McpServerConfig> {
    try {
      const saved = databaseAPI.dbGet(DB_KEY)
      if (saved) {
        this.config = {
          enabled: saved.enabled ?? false,
          port: saved.port ?? DEFAULT_PORT,
          apiKey: saved.apiKey || this.generateApiKey()
        }
      }
    } catch (error) {
      console.error('[McpServer] 加载配置失败:', error)
    }
    return this.config
  }

  /**
   * 保存 MCP 服务配置到数据库。
   */
  public async saveConfig(config: Partial<McpServerConfig>): Promise<McpServerConfig> {
    this.config = { ...this.config, ...config }
    databaseAPI.dbPut(DB_KEY, {
      enabled: this.config.enabled,
      port: this.config.port,
      apiKey: this.config.apiKey
    })
    return this.config
  }

  /**
   * 获取当前配置；若缺少 API Key，会即时生成并落库。
   */
  public getConfig(): McpServerConfig {
    if (!this.config.apiKey) {
      this.config.apiKey = this.generateApiKey()
      this.saveConfig({ apiKey: this.config.apiKey })
    }
    return { ...this.config }
  }

  /**
   * 生成用于本地 MCP 访问鉴权的随机 API Key。
   */
  public generateApiKey(): string {
    return randomBytes(16).toString('hex')
  }

  /**
   * 启动 MCP HTTP 服务。
   */
  public start(): boolean {
    if (this.server) {
      this.stop()
    }

    try {
      this.server = createServer((req, res) => this.handleRequest(req, res))

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        console.error('[McpServer] 服务器错误:', error)
        if (error.code === 'EADDRINUSE') {
          console.error(`[McpServer] 端口 ${this.config.port} 已被占用`)
        }
        this.server = null
      })

      // 监听全部网卡地址，允许局域网内其他设备通过本机 IP 访问。
      this.server.listen(this.config.port, '0.0.0.0', () => {
        console.log(`[McpServer] 服务已启动: http://0.0.0.0:${this.config.port}/mcp`)
      })

      return true
    } catch (error) {
      console.error('[McpServer] 启动失败:', error)
      this.server = null
      return false
    }
  }

  /**
   * 停止 MCP HTTP 服务。
   */
  public stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log('[McpServer] 服务已停止')
      })
      this.server = null
    }
  }

  /**
   * 返回服务当前是否处于监听状态。
   */
  public isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  /**
   * 发送 JSON 响应，并附带 MCP 所需的基础 CORS 头。
   */
  private sendRawJson(res: ServerResponse, statusCode: number, body: unknown): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end(JSON.stringify(body))
  }

  /**
   * 返回空响应，主要用于 OPTIONS 和 JSON-RPC notification。
   */
  private sendNoContent(res: ServerResponse): void {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end()
  }

  /**
   * 处理所有进入 MCP 服务的 HTTP 请求。
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      this.sendNoContent(res)
      return
    }

    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
    const pathname = requestUrl.pathname

    if (req.method === 'GET' && pathname === '/mcp') {
      this.sendRawJson(res, 200, {
        name: 'ZTools MCP',
        protocolVersion: MCP_PROTOCOL_VERSION,
        message: 'Use POST /mcp with JSON-RPC 2.0'
      })
      return
    }

    if (req.method !== 'POST' || pathname !== '/mcp') {
      this.sendMcpError(res, null, -32601, 'Method not found')
      return
    }

    // 同时支持标准 Authorization: Bearer 和 ?key= 查询参数鉴权。
    const authHeader = req.headers['authorization']
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const queryToken = requestUrl.searchParams.get('key')
    const token = bearerToken || queryToken
    if (!token || token !== this.config.apiKey) {
      this.sendMcpError(res, null, -32001, 'API 密钥无效')
      return
    }

    try {
      const body = await this.readBody(req)
      await this.handleMcpRequest(res, body)
    } catch (error) {
      console.error('[McpServer] 请求处理失败:', error)
      this.sendMcpError(
        res,
        null,
        -32603,
        error instanceof Error ? error.message : 'Internal error'
      )
    }
  }

  /**
   * 读取并解析请求体，仅接受 JSON 对象。
   */
  private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      const maxBodySize = 1024 * 1024

      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBodySize) {
          reject(new Error('请求体过大'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })

      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (!raw) {
          resolve({})
          return
        }
        try {
          resolve(JSON.parse(raw))
        } catch {
          reject(new Error('无效的 JSON 格式'))
        }
      })

      req.on('error', reject)
    })
  }

  /**
   * 校验 JSON-RPC 基础结构，并将请求转发到 MCP 路由层。
   */
  private async handleMcpRequest(
    res: ServerResponse,
    body: Record<string, unknown>
  ): Promise<void> {
    const request = body as JsonRpcRequest
    const id = request.id ?? null

    try {
      // 这里只接受标准 JSON-RPC 2.0 请求，避免把普通 HTTP 调用混入 MCP 入口。
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || !request.method) {
        this.sendMcpError(res, id, -32600, 'Invalid Request')
        return
      }

      const result = await this.routeMcpRequest(request)
      if (request.id === undefined) {
        this.sendNoContent(res)
        return
      }
      this.sendMcpResult(res, id, result)
    } catch (error: unknown) {
      if (error instanceof McpProtocolError) {
        this.sendMcpError(res, id, error.code, error.message, error.data)
        return
      }
      this.sendMcpError(res, id, -32603, error instanceof Error ? error.message : 'Internal error')
    }
  }

  /**
   * 路由 MCP 方法。
   * 当前仅实现 initialize、ping、tools/list、tools/call 等基础能力。
   */
  private async routeMcpRequest(request: JsonRpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'initialize':
        return {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'ztools-mcp',
            version: app.getVersion()
          }
        }
      case 'notifications/initialized':
        return {}
      case 'ping':
        return {}
      case 'tools/list':
        return {
          tools: pluginToolsAPI
            .getAllDeclaredToolEntries({ includeDisabled: false })
            .map((tool) => ({
              name: tool.mcpName,
              title: `${tool.pluginName} / ${tool.toolName}`,
              description: tool.description,
              inputSchema: tool.inputSchema
            }))
        }
      case 'tools/call':
        return await this.handleToolCall(request.params)
      default:
        throw new McpProtocolError(-32601, `Method not found: ${request.method}`)
    }
  }

  /**
   * 执行 tools/call：
   * 先解析工具名，再按需唤起插件，最后调用 preload 中注册的 handler。
   */
  private async handleToolCall(params?: Record<string, unknown>): Promise<unknown> {
    const toolName = typeof params?.name === 'string' ? params.name : ''
    if (!toolName) {
      throw new McpProtocolError(-32602, 'tools/call 缺少 name 参数')
    }

    const toolEntry = pluginToolsAPI
      .getAllDeclaredToolEntries({ includeDisabled: false })
      .find((tool) => tool.mcpName === toolName)
    if (!toolEntry) {
      throw new McpProtocolError(-32602, `未找到工具: ${toolName}`)
    }

    const webContents = await pluginToolsAPI.ensurePluginToolReady(
      toolEntry.pluginPath,
      toolEntry.toolName
    )
    if (!webContents) {
      throw new McpProtocolError(-32000, `插件 "${toolEntry.pluginName}" 未能就绪`)
    }

    const result = await pluginToolsAPI.executeRegisteredTool(
      webContents,
      toolEntry.toolName,
      params?.arguments ?? {}
    )

    return {
      // 同时返回文本结果和结构化结果，方便标准 MCP 客户端和调试工具消费。
      content: [
        {
          type: 'text',
          text: this.stringifyToolResult(result)
        }
      ],
      ...(result !== undefined ? { structuredContent: result } : {})
    }
  }

  /**
   * 将任意工具返回值转成 MCP 文本内容，便于通用客户端展示。
   */
  private stringifyToolResult(result: unknown): string {
    if (typeof result === 'string') return result
    if (result === undefined) return ''
    return JSON.stringify(result)
  }

  /**
   * 发送 JSON-RPC 成功结果。
   */
  private sendMcpResult(res: ServerResponse, id: string | number | null, result: unknown): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result
    }
    this.sendRawJson(res, 200, response)
  }

  /**
   * 发送 JSON-RPC 错误结果。
   */
  private sendMcpError(
    res: ServerResponse,
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data !== undefined ? { data } : {})
      }
    }
    this.sendRawJson(res, 200, response)
  }
}

export default new McpServer()
