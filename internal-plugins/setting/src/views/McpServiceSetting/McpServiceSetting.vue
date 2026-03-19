<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast, DetailPanel } from '@/components'

const { success, error } = useToast()

const MCP_PORT = 36579
const MCP_DISABLED_PLUGINS_KEY = 'settings-mcp-disabled-plugins'

interface McpToolEntry {
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

interface McpPluginGroup {
  pluginName: string
  pluginPath: string
  pluginLogo?: string
  enabled: boolean
  tools: McpToolEntry[]
}

const enabled = ref(false)
const apiKey = ref('')
const running = ref(false)
const mcpTools = ref<McpToolEntry[]>([])
const expandedPluginPath = ref('')
const savingPluginPath = ref('')
const selectedTool = ref<McpToolEntry | null>(null)

const mcpEndpoint = computed(() => `http://127.0.0.1:${MCP_PORT}/mcp`)
const mcpEndpointWithKey = computed(
  () => `${mcpEndpoint.value}?key=${encodeURIComponent(apiKey.value)}`
)
const selectedToolJson = computed(() => {
  if (!selectedTool.value) return ''
  return JSON.stringify(
    {
      description: selectedTool.value.description,
      inputSchema: selectedTool.value.inputSchema,
      outputSchema: selectedTool.value.outputSchema
    },
    null,
    2
  )
})

const pluginGroups = computed<McpPluginGroup[]>(() => {
  const groups = new Map<string, McpPluginGroup>()

  for (const tool of [...mcpTools.value].sort((a, b) => a.mcpName.localeCompare(b.mcpName))) {
    const current = groups.get(tool.pluginPath)
    if (current) {
      current.tools.push(tool)
      continue
    }

    groups.set(tool.pluginPath, {
      pluginName: tool.pluginName,
      pluginPath: tool.pluginPath,
      pluginLogo: tool.pluginLogo,
      enabled: tool.enabled,
      tools: [tool]
    })
  }

  return [...groups.values()].sort((a, b) => a.pluginName.localeCompare(b.pluginName))
})

async function copyText(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    success(message)
  } catch {
    error('复制失败')
  }
}

async function loadConfig(): Promise<void> {
  try {
    const [configResult, statusResult, toolsResult] = await Promise.all([
      window.ztools.internal.mcpServerGetConfig(),
      window.ztools.internal.mcpServerStatus(),
      window.ztools.internal.mcpServerTools()
    ])

    if (configResult.success && configResult.config) {
      enabled.value = configResult.config.enabled
      apiKey.value = configResult.config.apiKey
    }
    if (statusResult.success) {
      running.value = statusResult.running ?? false
    }
    if (toolsResult.success) {
      mcpTools.value = toolsResult.data || []
    }
  } catch (err) {
    console.error('加载 MCP 服务配置失败:', err)
  }
}

async function saveConfig(): Promise<void> {
  try {
    const result = await window.ztools.internal.mcpServerSaveConfig({
      enabled: enabled.value,
      port: MCP_PORT,
      apiKey: apiKey.value
    })

    if (!result.success) {
      error(`保存失败：${result.error}`)
      return
    }

    if (result.config) {
      apiKey.value = result.config.apiKey
    }

    const statusResult = await window.ztools.internal.mcpServerStatus()
    running.value = statusResult.success ? (statusResult.running ?? false) : false
  } catch (err: unknown) {
    error(`保存失败：${err instanceof Error ? err.message : '未知错误'}`)
  }
}

async function handleServiceToggle(): Promise<void> {
  await saveConfig()
}

async function togglePlugin(plugin: McpPluginGroup, value: boolean): Promise<void> {
  try {
    savingPluginPath.value = plugin.pluginPath
    const current = await window.ztools.internal.dbGet(MCP_DISABLED_PLUGINS_KEY)
    const disabled = new Set<string>(
      Array.isArray(current) ? current.filter((item: unknown) => typeof item === 'string') : []
    )

    if (value) {
      disabled.delete(plugin.pluginPath)
    } else {
      disabled.add(plugin.pluginPath)
    }

    await window.ztools.internal.dbPut(MCP_DISABLED_PLUGINS_KEY, [...disabled])
    await loadConfig()
  } catch (err: unknown) {
    error(`更新插件状态失败：${err instanceof Error ? err.message : '未知错误'}`)
  } finally {
    savingPluginPath.value = ''
  }
}

function handlePluginToggle(plugin: McpPluginGroup, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  togglePlugin(plugin, target.checked)
}

function togglePluginExpand(pluginPath: string): void {
  expandedPluginPath.value = expandedPluginPath.value === pluginPath ? '' : pluginPath
}

function openToolDetail(tool: McpToolEntry): void {
  selectedTool.value = tool
}

function closeToolDetail(): void {
  selectedTool.value = null
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="content-panel">
    <Transition name="list-slide">
      <div v-show="!selectedTool" class="scrollable-content">
        <div class="service-hero">
          <div class="service-copy">
            <div class="service-meta">
              <h2 class="service-title">MCP 服务</h2>
              <p class="service-desc">
                使用固定端口 {{ MCP_PORT }} 对外暴露插件工具，复制后的地址会自动拼上访问密钥。
              </p>
            </div>

            <div class="service-actions">
              <label class="toggle">
                <input v-model="enabled" type="checkbox" @change="handleServiceToggle" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="service-foot">
            <div class="service-endpoint-wrap">
              <code class="service-endpoint">{{ mcpEndpoint }}</code>
              <button
                class="icon-button"
                type="button"
                title="复制带密钥地址"
                @click="copyText(mcpEndpointWithKey, '带密钥地址已复制')"
              >
                <svg
                  class="icon-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect
                    x="9"
                    y="9"
                    width="10"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="1.8"
                  />
                  <path
                    d="M15 9V7C15 5.89543 14.1046 5 13 5H7C5.89543 5 5 5.89543 5 7V13C5 14.1046 5.89543 15 7 15H9"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
            <span class="service-status" :class="{ active: running }">
              {{ running ? '运行中' : '未启动' }}
            </span>
          </div>
        </div>

        <div class="plugin-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">支持 MCP 的插件</h3>
              <p class="panel-desc">关闭某个插件后，它的所有 MCP 工具都会从服务端隐藏。</p>
            </div>
            <span class="panel-badge">{{ pluginGroups.length }}</span>
          </div>

          <div v-if="pluginGroups.length" class="plugin-grid">
            <div
              v-for="plugin in pluginGroups"
              :key="plugin.pluginPath"
              class="plugin-accordion"
              :class="{ expanded: expandedPluginPath === plugin.pluginPath }"
            >
              <div class="plugin-card">
                <button
                  class="plugin-card-head"
                  type="button"
                  @click="togglePluginExpand(plugin.pluginPath)"
                >
                  <div class="plugin-main">
                    <div class="detail-title-wrap">
                      <span class="accordion-arrow">{{
                        expandedPluginPath === plugin.pluginPath ? '−' : '+'
                      }}</span>
                      <img
                        v-if="plugin.pluginLogo"
                        :src="plugin.pluginLogo"
                        :alt="plugin.pluginName"
                        class="plugin-logo"
                      />
                      <div v-else class="plugin-logo plugin-logo-fallback">
                        {{ plugin.pluginName.slice(0, 1) }}
                      </div>

                      <div class="plugin-info">
                        <div class="plugin-name-row">
                          <span class="plugin-name">{{ plugin.pluginName }}</span>
                          <span class="plugin-tool-count">{{ plugin.tools.length }} 个工具</span>
                        </div>
                        <p class="plugin-hint">
                          {{ plugin.enabled ? '已向 MCP 暴露' : '已禁用 MCP 暴露' }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <label class="toggle plugin-toggle" @click.stop>
                    <input
                      :checked="plugin.enabled"
                      :disabled="savingPluginPath === plugin.pluginPath"
                      type="checkbox"
                      @change="handlePluginToggle(plugin, $event)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </button>

                <div v-if="expandedPluginPath === plugin.pluginPath" class="accordion-body">
                  <div class="tool-list">
                    <div v-for="tool in plugin.tools" :key="tool.mcpName" class="tool-card">
                      <div class="tool-head">
                        <div class="tool-meta">
                          <code class="tool-mcp-name">{{ tool.mcpName }}</code>
                          <code class="tool-name">{{ tool.toolName }}</code>
                        </div>
                        <button
                          class="icon-button tool-detail-button"
                          type="button"
                          title="查看工具详情"
                          @click="openToolDetail(tool)"
                        >
                          <svg
                            class="icon-svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                          >
                            <circle
                              cx="11"
                              cy="11"
                              r="6.5"
                              stroke="currentColor"
                              stroke-width="1.8"
                            />
                            <path
                              d="M16 16L20 20"
                              stroke="currentColor"
                              stroke-width="1.8"
                              stroke-linecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <p class="tool-desc">{{ tool.description }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">当前没有插件声明 MCP 工具</div>
        </div>
      </div>
    </Transition>

    <Transition name="slide">
      <DetailPanel v-if="selectedTool" :title="selectedTool.toolName" @back="closeToolDetail">
        <div class="tool-detail-content">
          <div class="tool-detail-card">
            <div class="tool-detail-header">
              <code class="tool-mcp-name">{{ selectedTool.mcpName }}</code>
              <p class="panel-desc tool-detail-desc">
                {{ selectedTool.pluginName }} 的 MCP 工具 JSON 描述
              </p>
            </div>
            <pre class="tool-json">{{ selectedToolJson }}</pre>
          </div>
        </div>
      </DetailPanel>
    </Transition>
  </div>
</template>

<style scoped>
.content-panel {
  position: relative;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(79, 123, 255, 0.08), transparent 26%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 24%), var(--bg-color);
}

.scrollable-content {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
}

.list-slide-enter-active {
  transition:
    transform 0.2s ease-out,
    opacity 0.15s ease;
}

.list-slide-leave-active {
  transition:
    transform 0.2s ease-in,
    opacity 0.15s ease;
}

.list-slide-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.list-slide-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.list-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.list-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.service-hero,
.plugin-panel {
  border: 1px solid var(--divider-color);
  border-radius: 18px;
  background: var(--card-bg);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.05);
}

.service-hero {
  padding: 22px 24px;
}

.service-copy,
.service-foot,
.panel-head,
.plugin-card,
.plugin-main,
.plugin-name-row,
.tool-head,
.service-endpoint-wrap,
.detail-title-wrap {
  display: flex;
  align-items: center;
}

.service-copy,
.panel-head,
.plugin-card {
  justify-content: space-between;
}

.service-title,
.panel-title {
  margin: 0;
  color: var(--text-color);
}

.service-title {
  font-size: 24px;
  font-weight: 700;
}

.service-desc,
.panel-desc,
.plugin-hint,
.tool-desc {
  margin: 0;
  color: var(--text-secondary);
}

.service-desc,
.panel-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
}

.service-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.service-foot {
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--divider-color);
}

.service-endpoint,
.tool-mcp-name,
.tool-name {
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

.service-endpoint {
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--hover-bg);
  color: var(--text-color);
  font-size: 12px;
}

.service-endpoint-wrap {
  gap: 8px;
  min-width: 0;
}

.icon-button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  color: var(--text-color);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.icon-button:hover {
  border-color: var(--primary-color, #4f7bff);
  background: var(--hover-bg);
  transform: translateY(-1px);
}

.icon-svg {
  width: 16px;
  height: 16px;
  display: block;
}

.service-status {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--hover-bg);
  color: var(--text-secondary);
  font-size: 12px;
}

.service-status.active {
  background: rgba(52, 199, 89, 0.12);
  color: var(--success-color, #34c759);
}

.plugin-panel {
  margin-top: 18px;
  padding: 20px;
}

.panel-badge {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--hover-bg);
  color: var(--text-color);
  font-size: 12px;
  font-weight: 700;
}

.plugin-grid,
.tool-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
}

.plugin-card,
.tool-card {
  width: 100%;
  border: 1px solid var(--divider-color);
  border-radius: 16px;
  background: var(--bg-color);
}

.plugin-card {
  display: block;
  overflow: hidden;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.plugin-card:hover {
  transform: translateY(-1px);
  border-color: var(--primary-color, #4f7bff);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.plugin-card-head {
  width: 100%;
  padding: 16px 18px;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  text-align: left;
}

.plugin-main,
.detail-title-wrap {
  gap: 14px;
  min-width: 0;
}

.plugin-logo {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}

.plugin-logo-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a, #334155);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.plugin-info {
  min-width: 0;
}

.plugin-name-row {
  gap: 10px;
  justify-content: flex-start;
}

.plugin-name {
  color: var(--text-color);
  font-size: 15px;
  font-weight: 700;
}

.plugin-tool-count {
  color: var(--text-secondary);
  font-size: 12px;
}

.plugin-hint {
  margin-top: 4px;
  font-size: 12px;
}

.plugin-toggle {
  flex-shrink: 0;
}

.detail-title-wrap {
  min-width: 0;
}

.accordion-arrow {
  width: 20px;
  color: var(--text-secondary);
  font-size: 18px;
  font-weight: 400;
  text-align: center;
  flex-shrink: 0;
}

.tool-card {
  padding: 16px 18px;
  background: var(--hover-bg);
}

.accordion-body {
  display: block;
  padding: 0 18px 18px;
  border-top: 1px solid var(--divider-color);
}

.tool-head {
  gap: 10px;
  justify-content: space-between;
  align-items: flex-start;
}

.tool-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tool-mcp-name {
  color: var(--text-color);
  font-size: 12px;
}

.tool-name {
  color: var(--text-secondary);
  font-size: 12px;
}

.tool-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
}

.tool-detail-button {
  flex-shrink: 0;
}

.tool-detail-content {
  padding: 20px;
}

.tool-detail-card {
  border: 1px solid var(--divider-color);
  border-radius: 16px;
  background: var(--bg-color);
  overflow: hidden;
}

.tool-detail-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--divider-color);
  background: var(--card-bg);
}

.tool-detail-desc {
  margin-top: 8px;
}

.tool-json {
  margin: 0;
  padding: 18px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-state {
  margin-top: 18px;
  padding: 24px;
  border-radius: 16px;
  background: var(--hover-bg);
  color: var(--text-secondary);
  text-align: center;
}

@media (max-width: 720px) {
  .content-panel {
  }

  .scrollable-content {
    padding: 16px;
  }

  .service-copy,
  .service-foot,
  .plugin-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .service-actions,
  .plugin-toggle {
    margin-top: 14px;
  }

  .service-foot {
    gap: 10px;
  }
}
</style>
