<script setup lang="ts">
import { marked } from 'marked'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast, DetailPanel, CommandTag, FeatureCard } from '@/components'

interface PluginFeature {
  code: string
  name?: string
  explain?: string
  icon?: string
  cmds?: any[]
}

interface PluginItem {
  name: string
  title: string
  version?: string
  description?: string
  logo?: string
  features?: PluginFeature[]
  installed?: boolean
  isDevelopment?: boolean
  localVersion?: string
  path?: string
  size?: number
  author?: string
  homepage?: string
}

interface DocItem {
  key: string
  type: 'document' | 'attachment'
}

const props = defineProps<{
  plugin: PluginItem
  isLoading?: boolean
  isRunning?: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'open'): void
  (e: 'download'): void
  (e: 'upgrade'): void
  (e: 'uninstall'): void
  (e: 'kill'): void
  (e: 'open-folder'): void
  (e: 'package'): void
  (e: 'reload'): void
}>()

const { success, error, confirm } = useToast()

// 插件设置状态
const showSettingsDropdown = ref(false)
const isAutoKill = ref(false)
const isAutoDetach = ref(false)
const isAutoStart = ref(false)

// 点击外部关闭下拉菜单
function handleClickOutside(): void {
  showSettingsDropdown.value = false
}

function toggleSettingsDropdown(): void {
  showSettingsDropdown.value = !showSettingsDropdown.value
}

// 加载插件设置
async function loadPluginSettings(): Promise<void> {
  if (!props.plugin.name) return

  try {
    const killData = await window.ztools.internal.dbGet('outKillPlugin')
    if (Array.isArray(killData)) {
      isAutoKill.value = killData.includes(props.plugin.name)
    }
  } catch (error) {
    console.debug('未找到 outKillPlugin 配置', error)
  }

  try {
    const detachData = await window.ztools.internal.dbGet('autoDetachPlugin')
    if (Array.isArray(detachData)) {
      isAutoDetach.value = detachData.includes(props.plugin.name)
    }
  } catch (error) {
    console.debug('未找到 autoDetachPlugin 配置', error)
  }

  try {
    const startData = await window.ztools.internal.dbGet('autoStartPlugin')
    if (Array.isArray(startData)) {
      isAutoStart.value = startData.includes(props.plugin.name)
    }
  } catch (error) {
    console.debug('未找到 autoStartPlugin 配置', error)
  }
}

// 切换「退出即结束」
async function toggleAutoKill(): Promise<void> {
  if (!props.plugin.name) return

  let list: string[] = []
  try {
    const data = await window.ztools.internal.dbGet('outKillPlugin')
    if (Array.isArray(data)) list = data
  } catch {
    // ignore
  }

  const index = list.indexOf(props.plugin.name)
  if (index >= 0) {
    list.splice(index, 1)
  } else {
    list.push(props.plugin.name)
  }

  await window.ztools.internal.dbPut('outKillPlugin', list)
  isAutoKill.value = list.includes(props.plugin.name)
}

// 切换「自动分离窗口」
async function toggleAutoDetach(): Promise<void> {
  if (!props.plugin.name) return

  let list: string[] = []
  try {
    const data = await window.ztools.internal.dbGet('autoDetachPlugin')
    if (Array.isArray(data)) list = data
  } catch {
    // ignore
  }

  const index = list.indexOf(props.plugin.name)
  if (index >= 0) {
    list.splice(index, 1)
  } else {
    list.push(props.plugin.name)
  }

  await window.ztools.internal.dbPut('autoDetachPlugin', list)
  isAutoDetach.value = list.includes(props.plugin.name)
}

// 切换「跟随主程序同时启动运行」
async function toggleAutoStart(): Promise<void> {
  if (!props.plugin.name) return

  let list: string[] = []
  try {
    const data = await window.ztools.internal.dbGet('autoStartPlugin')
    if (Array.isArray(data)) list = data
  } catch {
    // ignore
  }

  const index = list.indexOf(props.plugin.name)
  if (index >= 0) {
    list.splice(index, 1)
  } else {
    list.push(props.plugin.name)
  }

  await window.ztools.internal.dbPut('autoStartPlugin', list)
  isAutoStart.value = list.includes(props.plugin.name)
}

// Tab 状态
type TabId = 'detail' | 'commands' | 'data'
const activeTab = ref<TabId>('detail')

// README 状态
const readmeContent = ref<string>('')
const readmeLoading = ref(false)
const readmeError = ref<string>('')

// 插件数据状态
const docKeys = ref<DocItem[]>([])
const dataLoading = ref(false)
const dataError = ref<string>('')
const expandedDataId = ref<string>('')
const currentDocContent = ref<any>(null)
const currentDocType = ref<'document' | 'attachment'>('document')
const isClearing = ref(false)

// 内存信息状态
const memoryInfo = ref<{ private: number; shared: number; total: number } | null>(null)
const memoryLoading = ref(false)
let memoryUpdateTimer: ReturnType<typeof setTimeout> | null = null

// 配置 marked
marked.setOptions({
  breaks: true, // 支持 GitHub 风格的换行
  gfm: true // 启用 GitHub Flavored Markdown
})

// 渲染 Markdown
const renderedMarkdown = computed(() => {
  if (!readmeContent.value) return ''
  return marked(readmeContent.value)
})

// 可用的 Tab（数据 Tab 仅在已安装时显示）
const availableTabs = computed(() => {
  const tabs = [
    { id: 'detail' as TabId, label: '详情' },
    { id: 'commands' as TabId, label: '指令列表' }
  ]

  if (props.plugin.installed) {
    tabs.push({ id: 'data' as TabId, label: '数据' })
  }

  return tabs
})

// 切换 Tab
function switchTab(tabId: TabId): void {
  activeTab.value = tabId

  // 切换到数据 Tab 时加载数据
  if (tabId === 'data' && !docKeys.value.length && !dataLoading.value) {
    loadPluginData()
  }
}

// 加载 README
async function loadReadme(): Promise<void> {
  readmeLoading.value = true
  readmeError.value = ''

  try {
    // 如果是已安装的插件，优先读取本地 README
    if (props.plugin.installed && props.plugin.path) {
      const result = await window.ztools.internal.getPluginReadme(props.plugin.path)
      if (result.success && result.content) {
        readmeContent.value = result.content
        return
      }

      // 本地读取失败，尝试从 GitHub 获取在线版本
      if (props.plugin.name) {
        console.log('本地 README 不存在，尝试从 GitHub 获取:', props.plugin.name)
        const remoteResult = await window.ztools.internal.getPluginReadme(props.plugin.name)
        if (remoteResult.success && remoteResult.content) {
          readmeContent.value = remoteResult.content
          return
        }
      }

      // 本地和远程都失败
      readmeError.value = '暂无详情'
    }
    // 如果是未安装的插件，从远程加载
    else if (props.plugin.name) {
      const result = await window.ztools.internal.getPluginReadme(props.plugin.name)
      if (result.success && result.content) {
        readmeContent.value = result.content
      } else {
        readmeError.value = result.error || '加载失败'
      }
    } else {
      readmeError.value = '插件信息不完整'
    }
  } catch (error) {
    console.error('加载 README 失败:', error)
    readmeError.value = '读取失败'
  } finally {
    readmeLoading.value = false
  }
}

// 加载插件数据（文档和附件列表）
async function loadPluginData(): Promise<void> {
  if (!props.plugin.name) {
    dataError.value = '插件名称不存在'
    return
  }

  dataLoading.value = true
  dataError.value = ''

  try {
    const result = await window.ztools.internal.getPluginDocKeys(props.plugin.name)
    if (result.success) {
      docKeys.value = result.data || []
    } else {
      dataError.value = result.error || '获取失败'
    }
  } catch (error) {
    console.error('加载插件数据失败:', error)
    dataError.value = '获取失败'
  } finally {
    dataLoading.value = false
  }
}

// 清除插件全部数据
async function handleClearAllData(): Promise<void> {
  if (!props.plugin.name || isClearing.value) return

  // 确认弹窗，说明危险性
  const confirmed = await confirm({
    title: '清除全部数据',
    message: `确定要清除插件"${props.plugin.name}"的全部数据吗？\n\n⚠️ 警告：此操作将永久删除该插件存储的所有数据，包括文档和附件。\n\n此操作不可恢复，请谨慎操作！`,
    type: 'danger',
    confirmText: '清除',
    cancelText: '取消'
  })

  if (!confirmed) return

  isClearing.value = true
  try {
    const result = await window.ztools.internal.clearPluginData(props.plugin.name)
    if (result.success) {
      success('插件数据已清除')
      // 清空当前展开的数据
      expandedDataId.value = ''
      currentDocContent.value = null
      // 重新加载数据列表
      await loadPluginData()
    } else {
      error(`清除失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('清除插件数据失败:', err)
    error(`清除失败: ${err.message || '未知错误'}`)
  } finally {
    isClearing.value = false
  }
}

// 版本比较函数
function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const len = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0
    const num2 = parts2[i] || 0
    if (num1 < num2) return -1
    if (num1 > num2) return 1
  }
  return 0
}

// 判断是否可以升级
const canUpgrade = computed(() => {
  if (!props.plugin.installed || !props.plugin.localVersion || !props.plugin.version) return false
  return compareVersions(props.plugin.localVersion, props.plugin.version) < 0
})

// 处理卸载（与列表删除使用相同的自定义确认弹窗）
async function handleUninstall(): Promise<void> {
  const confirmed = await confirm({
    title: '删除插件',
    message: `确定要删除插件"${props.plugin.name}"吗？\n\n此操作将删除插件文件，无法恢复。`,
    type: 'danger',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (confirmed) {
    emit('uninstall')
  }
}

function cmdKey(cmd: any): string {
  if (cmd && typeof cmd === 'object') {
    return cmd.label || cmd.text || cmd.name || ''
  }
  return String(cmd)
}

// 标准化 command 数据格式，适配 CommandTag 组件
function normalizeCommand(cmd: any): any {
  // 如果是对象（匹配指令）
  if (cmd && typeof cmd === 'object') {
    return {
      name: cmd.label || cmd.name,
      text: cmd.label,
      type: cmd.type,
      match: cmd.match
    }
  }
  // 如果是字符串（功能指令）
  return {
    text: String(cmd),
    type: 'text'
  }
}

// 切换数据详情展开状态
async function toggleDataDetail(item: DocItem): Promise<void> {
  // 如果点击的是已展开的项，则收起
  if (expandedDataId.value === item.key) {
    expandedDataId.value = ''
    currentDocContent.value = null
    return
  }

  // 展开新项，加载数据
  expandedDataId.value = item.key
  currentDocType.value = item.type

  try {
    const result = await window.ztools.internal.getPluginDoc(props.plugin.name, item.key)
    if (result.success) {
      currentDocContent.value = result.data
      currentDocType.value = result.type || 'document'
    } else {
      currentDocContent.value = { error: result.error || '加载失败' }
    }
  } catch (error) {
    console.error('加载文档内容失败:', error)
    currentDocContent.value = { error: '加载失败' }
  }
}

// 格式化 JSON 数据
function formatJsonData(data: any): string {
  if (!data) return ''
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

// 格式化日期
function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return dateStr
  }
}

// 格式化文件大小
function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`
  }
  const kb = bytes / 1024
  return `${kb.toFixed(2)} KB`
}

// 打开主页
function openHomepage(): void {
  if (props.plugin.homepage) {
    window.ztools.shellOpenExternal(props.plugin.homepage)
  }
}

// 加载插件内存信息
async function loadMemoryInfo(): Promise<void> {
  console.log('[PluginDetail] 开始加载内存信息', {
    pluginName: props.plugin.name,
    pluginPath: props.plugin.path,
    isRunning: props.isRunning
  })

  if (!props.plugin.path) {
    console.warn('[PluginDetail] 插件路径不存在')
    memoryInfo.value = null
    return
  }

  if (!props.isRunning) {
    console.log('[PluginDetail] 插件未运行，不获取内存信息')
    memoryInfo.value = null
    return
  }

  memoryLoading.value = true
  try {
    console.log('[PluginDetail] 调用 API 获取内存信息，路径:', props.plugin.path)
    const result = await window.ztools.internal.getPluginMemoryInfo(props.plugin.path)
    console.log('[PluginDetail] API 返回结果:', result)

    if (result.success && result.data) {
      console.log('[PluginDetail] 成功获取内存信息:', result.data)
      memoryInfo.value = result.data
    } else {
      console.warn('[PluginDetail] API 返回失败或数据为空:', result)
      memoryInfo.value = null
    }
  } catch (error) {
    console.error('[PluginDetail] 获取插件内存信息失败:', error)
    memoryInfo.value = null
  } finally {
    memoryLoading.value = false
  }
}

// 启动内存信息定时更新
function startMemoryUpdate(): void {
  console.log('[PluginDetail] 启动内存信息定时更新')

  // 立即加载一次
  loadMemoryInfo()

  // 每 3 秒更新一次
  if (memoryUpdateTimer) {
    clearInterval(memoryUpdateTimer)
  }
  memoryUpdateTimer = setInterval(() => {
    loadMemoryInfo()
  }, 3000)
}

// 停止内存信息更新
function stopMemoryUpdate(): void {
  console.log('[PluginDetail] 停止内存信息更新')
  if (memoryUpdateTimer) {
    clearInterval(memoryUpdateTimer)
    memoryUpdateTimer = null
  }
  memoryInfo.value = null
}

// 组件挂载时加载 README 和插件设置
onMounted(() => {
  console.log('[PluginDetail] 组件挂载', {
    pluginName: props.plugin.name,
    pluginPath: props.plugin.path,
    isRunning: props.isRunning,
    installed: props.plugin.installed
  })

  // 无论是否安装，只要有插件信息就尝试加载
  if (props.plugin.name || props.plugin.path) {
    loadReadme()
  }
  if (props.plugin.installed && props.plugin.name) {
    loadPluginSettings()
  }
  // 如果插件正在运行，启动内存监控
  if (props.isRunning) {
    console.log('[PluginDetail] 插件正在运行，启动内存监控')
    startMemoryUpdate()
  } else {
    console.log('[PluginDetail] 插件未运行，不启动内存监控')
  }
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  stopMemoryUpdate()
})

// 插件变化时重新加载设置
watch(
  () => props.plugin.name,
  () => {
    if (props.plugin.installed && props.plugin.name) {
      loadPluginSettings()
    }
  }
)

// 监听插件运行状态变化
watch(
  () => props.isRunning,
  (newValue) => {
    console.log('[PluginDetail] 插件运行状态变化:', {
      pluginName: props.plugin.name,
      isRunning: newValue
    })
    if (newValue) {
      startMemoryUpdate()
    } else {
      stopMemoryUpdate()
    }
  }
)
</script>
<template>
  <DetailPanel title="插件详情" @back="emit('back')">
    <template #header-right>
      <template v-if="plugin.installed && !canUpgrade">
        <button class="icon-btn topbar-action-btn open-btn" title="打开" @click="emit('open')">
          <div class="i-z-play font-size-16px" />
        </button>
        <button
          v-if="isRunning"
          class="icon-btn topbar-action-btn kill-btn"
          title="终止运行"
          @click="emit('kill')"
        >
          <div class="i-z-stop font-size-16px" />
        </button>
        <button
          class="icon-btn topbar-action-btn folder-btn"
          title="打开插件目录"
          @click="emit('open-folder')"
        >
          <div class="i-z-folder font-size-16px" />
        </button>
        <button
          v-if="plugin.isDevelopment"
          class="icon-btn topbar-action-btn package-btn"
          title="打包插件为 zpx"
          @click="emit('package')"
        >
          <div class="i-z-package font-size-16px" />
        </button>
        <button
          class="icon-btn topbar-action-btn reload-btn"
          title="重新加载 plugin.json 配置文件"
          @click="emit('reload')"
        >
          <div class="i-z-refresh font-size-16px" />
        </button>
        <button class="icon-btn topbar-action-btn delete-btn" title="卸载" @click="handleUninstall">
          <div class="i-z-trash font-size-16px" />
        </button>
        <div class="topbar-settings-wrapper">
          <button
            class="icon-btn topbar-action-btn"
            :class="{ active: showSettingsDropdown }"
            title="插件设置"
            @click.stop="toggleSettingsDropdown"
          >
            <div class="i-z-settings font-size-16px" />
          </button>
          <Transition name="dropdown">
            <div v-if="showSettingsDropdown" class="settings-dropdown" @click.stop>
              <div class="settings-dropdown-item">
                <div class="settings-item-info">
                  <span class="settings-item-label">退出即结束</span>
                  <span class="settings-item-desc">退出到后台时立即终止插件进程</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" :checked="isAutoKill" @change="toggleAutoKill" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="settings-dropdown-item">
                <div class="settings-item-info">
                  <span class="settings-item-label">自动分离窗口</span>
                  <span class="settings-item-desc">打开时自动分离为独立窗口</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" :checked="isAutoDetach" @change="toggleAutoDetach" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="settings-dropdown-item">
                <div class="settings-item-info">
                  <span class="settings-item-label">跟随启动</span>
                  <span class="settings-item-desc">跟随主程序同时启动运行</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" :checked="isAutoStart" @change="toggleAutoStart" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </Transition>
        </div>
      </template>
    </template>
    <!-- 插件基本信息 -->
    <div class="detail-content">
      <div class="detail-header">
        <!-- 左侧：图标 + 信息 -->
        <div class="detail-left">
          <img
            v-if="plugin.logo"
            :src="plugin.logo"
            class="detail-icon"
            alt="插件图标"
            draggable="false"
          />
          <div v-else class="detail-icon placeholder">🧩</div>
          <div class="detail-info">
            <div class="detail-title">
              <span class="detail-name">{{ plugin.title || plugin.name }}</span>
            </div>
            <div class="detail-desc">{{ plugin.description || '暂无描述' }}</div>
          </div>
        </div>

        <!-- 右侧：按钮 -->
        <div class="detail-actions">
          <template v-if="plugin.installed">
            <button
              v-if="canUpgrade"
              class="btn btn-md btn-warning"
              :disabled="isLoading"
              @click="emit('upgrade')"
            >
              <div v-if="isLoading" class="btn-loading">
                <div class="spinner"></div>
              </div>
              <span v-else>升级到 v{{ plugin.version }}</span>
            </button>
          </template>
          <button
            v-else
            class="btn btn-icon"
            title="下载"
            :disabled="isLoading"
            @click="emit('download')"
          >
            <div v-if="isLoading" class="spinner"></div>
            <svg
              v-else
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M7 10L12 15L17 10"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 15V3"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- App Store 风格的三栏信息 -->
      <div class="detail-meta">
        <div class="meta-item">
          <div class="meta-label">开发者</div>
          <div class="meta-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div
            v-if="plugin.author"
            class="meta-value"
            :class="{ clickable: plugin.homepage }"
            @click="openHomepage"
          >
            {{ plugin.author }}
          </div>
          <div v-else class="meta-value">未知</div>
        </div>

        <div class="meta-divider"></div>

        <div class="meta-item">
          <div class="meta-label">版本</div>
          <div class="meta-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9 11L12 14L22 4"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div class="meta-value">{{ plugin.version || '-' }}</div>
        </div>

        <div class="meta-divider"></div>

        <div class="meta-item">
          <div class="meta-label">大小</div>
          <div class="meta-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M7 10L12 15L17 10"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 15V3"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div class="meta-value">{{ formatSize(plugin.size) || '-' }}</div>
        </div>

        <div v-if="plugin.installed && isRunning" class="meta-divider"></div>

        <div v-if="plugin.installed && isRunning" class="meta-item">
          <div class="meta-label">内存</div>
          <div class="meta-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="2"
                y="5"
                width="20"
                height="14"
                rx="2"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path d="M7 9L7 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M12 9L12 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M17 9L17 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <div v-if="memoryLoading" class="meta-value">
            <span class="memory-loading">...</span>
          </div>
          <div v-else-if="memoryInfo" class="meta-value">{{ memoryInfo.total }} MB</div>
          <div v-else class="meta-value">-</div>
        </div>
      </div>
    </div>

    <!-- Tab 栏 -->
    <div class="tab-container">
      <div class="tab-header">
        <button
          v-for="tab in availableTabs"
          :key="tab.id"
          class="tab-button"
          :class="{ active: activeTab === tab.id }"
          @click="switchTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="tab-content">
        <!-- 详情 Tab -->
        <div v-if="activeTab === 'detail'" class="tab-panel">
          <div v-if="readmeLoading" class="loading-container">
            <div class="spinner"></div>
            <span>加载中...</span>
          </div>
          <div v-else-if="readmeError" class="error-container">
            <span>{{ readmeError }}</span>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-else-if="readmeContent" class="markdown-content" v-html="renderedMarkdown"></div>
          <div v-else class="empty-message">该插件暂无详情说明</div>
        </div>

        <!-- 指令列表 Tab -->
        <div v-if="activeTab === 'commands'" class="tab-panel">
          <div v-if="plugin.features && plugin.features.length > 0" class="feature-list">
            <FeatureCard v-for="feature in plugin.features" :key="feature.code" :feature="feature">
              <CommandTag
                v-for="cmd in feature.cmds"
                :key="cmdKey(cmd)"
                :command="normalizeCommand(cmd)"
              />
            </FeatureCard>
          </div>
          <div v-else class="empty-message">暂无指令</div>
        </div>

        <!-- 数据 Tab（仅已安装插件可见） -->
        <div v-if="activeTab === 'data'" class="tab-panel">
          <div v-if="dataLoading" class="loading-container">
            <div class="spinner"></div>
            <span>加载中...</span>
          </div>
          <div v-else-if="dataError" class="error-container">
            <span>{{ dataError }}</span>
          </div>
          <div v-else-if="docKeys && docKeys.length > 0" class="data-container">
            <div class="data-header-actions">
              <button
                class="btn btn-sm btn-danger"
                :disabled="isClearing"
                @click="handleClearAllData"
              >
                {{ isClearing ? '清除中...' : '清除全部数据' }}
              </button>
            </div>
            <div class="data-list">
              <div
                v-for="item in docKeys"
                :key="item.key"
                class="card data-item"
                :class="{ expanded: expandedDataId === item.key }"
                @click="toggleDataDetail(item)"
              >
                <div class="data-header">
                  <span class="data-key">{{ item.key }}</span>
                  <div class="data-header-right">
                    <span class="doc-type-badge" :class="`type-${item.type}`">
                      {{ item.type === 'document' ? '文档' : '附件' }}
                    </span>
                    <svg
                      class="expand-icon"
                      :class="{ rotated: expandedDataId === item.key }"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M9 18L15 12L9 6"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <Transition name="expand">
                  <div v-if="expandedDataId === item.key" class="data-content">
                    <div class="data-meta">
                      <div class="data-meta-item">
                        <span class="label">类型:</span>
                        <span class="value type-badge" :class="`type-${currentDocType}`">
                          {{ currentDocType === 'document' ? '文档' : '附件' }}
                        </span>
                      </div>
                      <div v-if="currentDocContent?._rev" class="data-meta-item">
                        <span class="label">版本:</span>
                        <span class="value">{{ currentDocContent._rev }}</span>
                      </div>
                      <div
                        v-if="currentDocContent?._updatedAt || currentDocContent?.updatedAt"
                        class="data-meta-item"
                      >
                        <span class="label">更新时间:</span>
                        <span class="value">{{
                          formatDate(currentDocContent._updatedAt || currentDocContent.updatedAt)
                        }}</span>
                      </div>
                    </div>
                    <div class="data-json">
                      <pre>{{ formatJsonData(currentDocContent) }}</pre>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
          <div v-else class="empty-message">该插件暂无存储数据</div>
        </div>
      </div>
    </div>
  </DetailPanel>
</template>

<style scoped>
/* 顶栏图标按钮 */
.topbar-action-btn {
  color: var(--text-secondary);
  margin-left: 2px;
}

.topbar-action-btn:hover:not(:disabled) {
  background: var(--hover-bg);
}

.topbar-action-btn.open-btn {
  color: var(--primary-color);
}

.topbar-action-btn.open-btn:hover {
  background: var(--primary-light-bg);
}

.topbar-action-btn.kill-btn {
  color: var(--warning-color);
}

.topbar-action-btn.kill-btn:hover:not(:disabled) {
  background: var(--warning-light-bg);
}

.topbar-action-btn.folder-btn {
  color: var(--primary-color);
}

.topbar-action-btn.folder-btn:hover {
  background: var(--primary-light-bg);
}

.topbar-action-btn.package-btn {
  color: var(--purple-color);
}

.topbar-action-btn.package-btn:hover:not(:disabled) {
  background: var(--purple-light-bg);
}

.topbar-action-btn.reload-btn {
  color: var(--primary-color);
}

.topbar-action-btn.reload-btn:hover:not(:disabled) {
  background: var(--primary-light-bg);
}

.topbar-action-btn.delete-btn {
  color: var(--danger-color);
}

.topbar-action-btn.delete-btn:hover:not(:disabled) {
  background: var(--danger-light-bg);
}

/* 设置按钮容器 */
.topbar-settings-wrapper {
  position: relative;
}

.topbar-action-btn.active {
  background: var(--hover-bg);
  color: var(--primary-color);
}

/* 设置下拉菜单 */
.settings-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 240px;
  background: var(--dialog-bg, var(--bg-color));
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--shadow-color);
  z-index: 100;
  overflow: hidden;
}

.settings-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  gap: 12px;
}

.settings-dropdown-item + .settings-dropdown-item {
  border-top: 1px solid var(--divider-color);
}

.settings-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.settings-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.settings-item-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.3;
}

/* 缩小 toggle 开关以适配下拉菜单 */
.settings-dropdown .toggle {
  transform: scale(0.8);
  transform-origin: right center;
  flex-shrink: 0;
}

/* 下拉菜单过渡动画 */
.dropdown-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.dropdown-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.detail-content {
  padding: 16px;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.detail-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.detail-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.detail-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.detail-actions .btn {
  min-width: 60px;
}

/* 按钮 loading 状态 */
.btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-right-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* 升级按钮中的 spinner */
.btn-warning .spinner {
  border-top-color: var(--text-on-primary);
  border-right-color: var(--text-on-primary);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.detail-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  object-fit: cover;
}

.detail-icon.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--active-bg);
  font-size: 28px;
}

.detail-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color);
}

.detail-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

/* 三栏信息 */
.detail-meta {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 16px 0;
  margin-top: 16px;
  border-top: 1px solid var(--divider-color);
}

.meta-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.meta-icon {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.meta-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.meta-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-color);
}

.meta-value.clickable {
  color: var(--primary-color);
  cursor: pointer;
  transition: opacity 0.2s;
}

.meta-value.clickable:hover {
  opacity: 0.7;
}

.meta-value.author-link.clickable {
  color: var(--primary-color);
  cursor: pointer;
  transition: opacity 0.2s;
}

.meta-value.author-link.clickable:hover {
  opacity: 0.7;
}

.memory-loading {
  color: var(--text-secondary);
  font-size: 14px;
}

.meta-divider {
  width: 1px;
  height: 32px;
  background: var(--divider-color);
  flex-shrink: 0;
}

/* Tab 容器 */
.tab-container {
  margin-top: 20px;
  margin-left: 10px;
  margin-right: 10px;
}

.tab-header {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--divider-color);
  margin-bottom: 16px;
}

.tab-button {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  bottom: -1px;
}

.tab-button:hover {
  color: var(--text-color);
  background: var(--hover-bg);
}

.tab-button.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

.tab-content {
  min-height: 200px;
}

.tab-panel {
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Loading 和 Error 状态 */
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  color: var(--text-secondary);
}

.error-container {
  color: var(--error-color);
}

.empty-message {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* Markdown 内容样式 - 使用全局变量 */
.markdown-content {
  padding: 12px;
  font-size: 14px;
  line-height: 1.6;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 600;
}

.markdown-content :deep(h1) {
  font-size: 1.8em;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}

.markdown-content :deep(h2) {
  font-size: 1.5em;
}

.markdown-content :deep(h3) {
  font-size: 1.2em;
}

.markdown-content :deep(p) {
  margin: 0.8em 0;
}

.markdown-content :deep(a) {
  color: var(--primary-color);
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 1em 0;
}

.markdown-content :deep(code) {
  padding: 2px 6px;
  background: var(--card-bg);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  padding: 12px;
  background: var(--card-bg);
  border-radius: 6px;
  overflow-x: auto;
  margin: 1em 0;
}

.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.5em;
  margin: 0.8em 0;
}

.markdown-content :deep(blockquote) {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 3px solid var(--primary-color);
  background: var(--card-bg);
  color: var(--text-secondary);
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  margin: 1em 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
}

.markdown-content :deep(th) {
  background: var(--card-bg);
  font-weight: 600;
}

/* 指令列表样式 */
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 数据容器 */
.data-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 数据头部操作区 */
.data-header-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 4px;
}

/* 数据列表样式 */
.data-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-item {
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.data-item:hover {
  background: var(--hover-bg);
}

.data-item.expanded {
  background: var(--active-bg);
}

.data-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  gap: 8px;
}

.data-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.data-key {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  font-family: monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
  transition: transform 0.2s;
}

.expand-icon.rotated {
  transform: rotate(90deg);
}

.data-content {
  padding: 0 14px 14px;
  border-top: 1px solid var(--divider-color);
}

.data-meta {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.data-meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.data-meta-item .label {
  color: var(--text-secondary);
  font-weight: 500;
}

.data-meta-item .value {
  color: var(--text-color);
  font-family: monospace;
}

.data-meta-item .value.type-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.data-meta-item .value.type-badge.type-document {
  background: var(--primary-light-bg);
  color: var(--primary-color);
}

.data-meta-item .value.type-badge.type-attachment {
  background: var(--purple-light-bg);
  color: var(--purple-color);
}

.doc-type-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.doc-type-badge.type-document {
  background: var(--primary-light-bg);
  color: var(--primary-color);
}

.doc-type-badge.type-attachment {
  background: var(--purple-light-bg);
  color: var(--purple-color);
}

.data-json {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
}

.data-json pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-all;
}

/* 展开/收起动画 */
.expand-enter-active,
.expand-leave-active {
  transition:
    max-height 0.3s ease,
    opacity 0.2s ease;
  max-height: 500px;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
