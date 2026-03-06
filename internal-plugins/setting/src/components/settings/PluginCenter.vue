<template>
  <div class="content-panel">
    <!-- 可滚动内容区 -->
    <Transition name="list-slide">
      <div v-show="!isDetailVisible" class="scrollable-content">
        <div class="panel-header">
          <div class="tab-group">
            <button
              class="tab-btn"
              :class="{ active: filterStatus === 'all' }"
              @click="filterStatus = 'all'"
            >
              全部
              <span class="tab-count">{{ allPluginsCount }}</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: filterStatus === 'running' }"
              @click="filterStatus = 'running'"
            >
              运行中
              <span class="tab-count">{{ runningPluginsCount }}</span>
            </button>
          </div>
          <div class="button-group">
            <button class="btn" :disabled="isImporting" @click="importPlugin">
              {{ isImporting ? '导入中...' : '导入本地插件' }}
            </button>
            <div class="more-menu-wrapper">
              <button class="btn btn-more" @click="toggleMoreMenu">
                更多
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div v-if="showMoreMenu" class="more-menu" @click="closeMoreMenu">
                <button
                  class="more-menu-item"
                  :disabled="isImportingDev"
                  @click="importDevPlugin"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M12 5v14M5 12h14"></path>
                  </svg>
                  {{ isImportingDev ? '添加中...' : '添加开发中插件' }}
                </button>
                <button
                  class="more-menu-item"
                  :disabled="isImportingNpm"
                  @click="showNpmInstallPanel"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  {{ isImportingNpm ? '安装中...' : '从 npm 安装' }}
                </button>
                <button
                  class="more-menu-item kill-all-item"
                  :disabled="isKillingAll || runningPluginsCount === 0"
                  @click="handleKillAllPlugins"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  </svg>
                  {{ isKillingAll ? '停止中...' : '停止所有插件' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 插件列表 -->
        <div class="plugin-list">
          <div
            v-for="plugin in filteredPlugins"
            :key="plugin.path"
            class="card plugin-item"
            :title="plugin.description"
            @click="openPluginDetail(plugin)"
          >
            <AdaptiveIcon
              v-if="plugin.logo"
              :src="plugin.logo"
              class="plugin-icon"
              alt="插件图标"
              draggable="false"
            />
            <div v-else class="plugin-icon-placeholder">🧩</div>

            <div class="plugin-info">
              <div class="plugin-name">
                {{ plugin.title || plugin.name }}
                <span class="plugin-version">v{{ plugin.version }}</span>
                <span v-if="plugin.isDevelopment" class="dev-badge">开发中</span>
                <span v-if="isPluginRunning(plugin.path)" class="running-badge">
                  <span class="status-dot"></span>
                  运行中
                </span>
              </div>
              <div class="plugin-desc">{{ plugin.description || '暂无描述' }}</div>
            </div>

            <div class="plugin-meta">
              <button
                class="icon-btn open-btn"
                title="打开插件"
                @click.stop="handleOpenPlugin(plugin)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
              <button
                v-if="isPluginRunning(plugin.path)"
                class="icon-btn kill-btn"
                title="终止运行"
                :disabled="isKilling"
                @click.stop="handleKillPlugin(plugin)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
              </button>
              <button
                class="icon-btn folder-btn"
                title="打开插件目录"
                @click.stop="handleOpenFolder(plugin)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  ></path>
                </svg>
              </button>
              <button
                class="icon-btn reload-btn"
                :disabled="isReloading"
                title="重新加载 plugin.json 配置文件"
                @click.stop="handleReloadPlugin(plugin)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path
                    d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                  ></path>
                </svg>
              </button>
              <button
                class="icon-btn pin-btn"
                :class="{ 'is-pinned': isPluginPinned(plugin.path) }"
                :title="isPluginPinned(plugin.path) ? '取消置顶' : '置顶'"
                @click.stop="togglePin(plugin)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="4" y1="4" x2="20" y2="4"></line>
                  <polyline points="8 10 12 4 16 10"></polyline>
                  <line x1="12" y1="10" x2="12" y2="20"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="!isLoading && plugins.length === 0" class="empty-state">
            <Icon name="plugin" :size="64" class="empty-icon" />
            <div class="empty-text">暂无插件</div>
            <div class="empty-hint">点击"导入本地插件"来安装你的第一个插件</div>
          </div>

          <!-- 搜索无结果 -->
          <div
            v-if="!isLoading && plugins.length > 0 && filteredPlugins.length === 0"
            class="empty-state"
          >
            <Icon name="plugin" :size="64" class="empty-icon" />
            <div class="empty-text">未找到匹配的插件</div>
            <div class="empty-hint">尝试使用其他关键词搜索</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 插件详情覆盖面板组件 -->
    <Transition name="slide">
      <PluginDetail
        v-if="isDetailVisible && selectedPlugin && !showNpmPanel"
        :plugin="selectedPlugin"
        :is-running="isPluginRunning(selectedPlugin.path)"
        @back="closePluginDetail"
        @open="handleOpenPlugin(selectedPlugin)"
        @uninstall="handleUninstallFromDetail(selectedPlugin)"
        @kill="handleKillPlugin(selectedPlugin)"
        @open-folder="handleOpenFolder(selectedPlugin)"
        @package="handlePackagePlugin(selectedPlugin)"
        @reload="handleReloadPluginFromDetail(selectedPlugin)"
      />
    </Transition>

    <!-- npm 安装面板 -->
    <Transition name="slide">
      <NpmInstallPanel
        v-if="isDetailVisible && showNpmPanel"
        ref="npmInstallPanelRef"
        :visible="showNpmPanel"
        @back="closeNpmPanel"
        @install="handleInstallFromNpm"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast } from '../../composables/useToast'
import { weightedSearch } from '../../utils/weightedSearch'
import AdaptiveIcon from '../common/AdaptiveIcon.vue'
import Icon from '../common/Icon.vue'
import PluginDetail from './PluginDetail.vue'
import NpmInstallPanel from './NpmInstallPanel.vue'

const props = defineProps<{
  searchQuery?: string
  addDevPluginFilePath?: string
  autoOpenPluginName?: string
}>()

const emit = defineEmits<{
  (e: 'auto-open-consumed'): void
  (e: 'add-dev-consumed'): void
  (e: 'navigate', page: string, params?: Record<string, string>): void
}>()

const { success, error, confirm } = useToast()

// 插件相关状态
const plugins = ref<any[]>([])
const runningPlugins = ref<string[]>([])
const isLoading = ref(true)
const isImporting = ref(false)
const isImportingDev = ref(false)
const isImportingNpm = ref(false)
const isDeleting = ref(false)
const isKilling = ref(false)
const isKillingAll = ref(false)
const isReloading = ref(false)
const isPackaging = ref(false)

// npm 安装相关状态
const showNpmPanel = ref(false)
const showMoreMenu = ref(false)

// 详情弹窗状态
const isDetailVisible = ref(false)
const selectedPlugin = ref<any | null>(null)
const npmInstallPanelRef = ref<InstanceType<typeof NpmInstallPanel>>()

// 过滤状态
const filterStatus = ref<'all' | 'running'>('all')

// 置顶列表（插件 path 有序数组，持久化到 db）
const PINNED_PLUGINS_KEY = 'plugin-center-pinned'
const pinnedPluginPaths = ref<string[]>([])

// 先进行搜索过滤（不考虑运行状态）
const searchFilteredPlugins = computed(() => {
  return weightedSearch(plugins.value, props.searchQuery || '', [
    { value: (p) => p.title || p.name || '', weight: 10 },
    { value: (p) => p.description || '', weight: 5 }
  ])
})

// 全部插件数量（经过搜索过滤）
const allPluginsCount = computed(() => searchFilteredPlugins.value.length)

// 运行中插件列表（经过搜索过滤）
const runningFilteredPlugins = computed(() => {
  return searchFilteredPlugins.value.filter((p) => isPluginRunning(p.path))
})

// 运行中插件数量（经过搜索过滤）
const runningPluginsCount = computed(() => {
  return runningFilteredPlugins.value.length
})

// 最终显示的插件列表（根据状态过滤，置顶的排在最前）
const filteredPlugins = computed(() => {
  let list =
    filterStatus.value === 'running'
      ? searchFilteredPlugins.value.filter((p) => isPluginRunning(p.path))
      : searchFilteredPlugins.value
  const pinnedOrder = pinnedPluginPaths.value
  if (pinnedOrder.length === 0) return list
  const pinnedSet = new Set(pinnedOrder)
  const pinnedItems = pinnedOrder
    .map((path) => list.find((p) => p.path === path))
    .filter(Boolean) as typeof list
  const unpinnedItems = list.filter((p) => !pinnedSet.has(p.path))
  return [...pinnedItems, ...unpinnedItems]
})

function isPluginPinned(pluginPath: string): boolean {
  return pinnedPluginPaths.value.includes(pluginPath)
}

async function togglePin(plugin: any): Promise<void> {
  const path = plugin.path
  const idx = pinnedPluginPaths.value.indexOf(path)
  if (idx >= 0) {
    pinnedPluginPaths.value = pinnedPluginPaths.value.filter((p) => p !== path)
  } else {
    pinnedPluginPaths.value = [path, ...pinnedPluginPaths.value]
  }
  try {
    // 将 Vue 响应式数组转换为普通数组，避免 IPC 克隆错误
    const plainArray = [...pinnedPluginPaths.value]
    await window.ztools.internal.dbPut(PINNED_PLUGINS_KEY, plainArray)
  } catch (e) {
    console.error('保存置顶列表失败:', e)
  }
}

// 加载插件列表
async function loadPlugins(): Promise<void> {
  isLoading.value = true
  try {
    const result = await window.ztools.internal.getPlugins()
    // 插件中心的插件都是已安装的，标记 installed 为 true
    plugins.value = result
      .map((plugin: any) => ({
        ...plugin,
        installed: true,
        localVersion: plugin.version
      }))
      .sort((a: any, b: any) => {
        // 按安装时间降序排序（最新安装的在前面）
        const timeA = a.installedAt ? new Date(a.installedAt).getTime() : 0
        const timeB = b.installedAt ? new Date(b.installedAt).getTime() : 0
        return timeB - timeA
      })
    // 同时加载运行中的插件
    await loadRunningPlugins()
  } catch (error) {
    console.error('加载插件列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 加载运行中的插件
async function loadRunningPlugins(): Promise<void> {
  try {
    const result = await window.ztools.internal.getRunningPlugins()
    runningPlugins.value = result
  } catch (error) {
    console.error('加载运行中插件失败:', error)
  }
}

// 检查插件是否运行中
function isPluginRunning(pluginPath: string): boolean {
  return runningPlugins.value.includes(pluginPath)
}

// 导入本地插件（选择文件后跳转到预览页面）
async function importPlugin(): Promise<void> {
  if (isImporting.value) return

  isImporting.value = true
  try {
    // 仅选择文件，不直接安装
    const result = await window.ztools.internal.selectPluginFile()
    if (result.success && result.filePath) {
      // 通知父组件切换到安装预览页面
      emit('navigate', 'install-plugin', { filePath: result.filePath })
    } else if (result.error && result.error !== '未选择文件') {
      error(`选择插件文件失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('选择插件文件失败:', err)
    error(`选择插件文件失败: ${err.message || '未知错误'}`)
  } finally {
    isImporting.value = false
  }
}

// 添加开发中插件
async function importDevPlugin(): Promise<void> {
  if (isImportingDev.value) return

  isImportingDev.value = true
  try {
    const result = await window.ztools.internal.importDevPlugin()
    if (result.success) {
      // 重新加载插件列表
      await loadPlugins()
      // 关闭更多菜单
      showMoreMenu.value = false
      success('开发中插件添加成功!')
    } else {
      error(`添加开发中插件失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('添加开发中插件失败:', err)
    error(`添加开发中插件失败: ${err.message || '未知错误'}`)
  } finally {
    isImportingDev.value = false
  }
}

// 自动添加开发插件（从文件路径）
async function tryAutoAddDevPlugin(): Promise<void> {
  const filePath = props.addDevPluginFilePath
  if (!filePath || isImportingDev.value) return

  isImportingDev.value = true
  try {
    const result = await window.ztools.internal.importDevPlugin(filePath)
    if (result.success) {
      // 重新加载插件列表
      await loadPlugins()
      success('开发中插件添加成功!')
    } else {
      error(`添加开发中插件失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('添加开发中插件失败:', err)
    error(`添加开发中插件失败: ${err.message || '未知错误'}`)
  } finally {
    isImportingDev.value = false
    emit('add-dev-consumed')
  }
}

// 删除插件
async function handleDeletePlugin(plugin: any): Promise<void> {
  if (isDeleting.value) return

  // 确认删除
  const confirmed = await confirm({
    title: '删除插件',
    message: `确定要删除插件"${plugin.name}"吗？\n\n此操作将删除插件文件，无法恢复。`,
    type: 'danger',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  isDeleting.value = true
  try {
    const result = await window.ztools.internal.deletePlugin(plugin.path)
    if (result.success) {
      // 重新加载插件列表
      await loadPlugins()
    } else {
      error(`插件删除失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('删除插件失败:', err)
    error(`删除插件失败: ${err.message || '未知错误'}`)
  } finally {
    isDeleting.value = false
  }
}

// 从详情页面卸载插件（确认弹窗在 PluginDetail 中已展示，此处直接执行删除）
async function handleUninstallFromDetail(plugin: any): Promise<void> {
  if (isDeleting.value) return

  isDeleting.value = true
  try {
    const result = await window.ztools.internal.deletePlugin(plugin.path)
    if (result.success) {
      success('插件卸载成功')
      // 关闭详情面板
      closePluginDetail()
      // 重新加载插件列表
      await loadPlugins()
    } else {
      error(`插件卸载失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('卸载插件失败:', err)
    error(`卸载插件失败: ${err.message || '未知错误'}`)
  } finally {
    isDeleting.value = false
  }
}

// 终止插件
async function handleKillPlugin(plugin: any): Promise<void> {
  if (isKilling.value) return

  isKilling.value = true
  try {
    const result = await window.ztools.internal.killPlugin(plugin.path)
    if (result.success) {
      // 重新加载运行状态
      await loadRunningPlugins()
    } else {
      error(`终止插件失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('终止插件失败:', err)
    error(`终止插件失败: ${err.message || '未知错误'}`)
  } finally {
    isKilling.value = false
  }
}

// 停止所有插件
async function handleKillAllPlugins(): Promise<void> {
  const pluginsToKill = runningFilteredPlugins.value
  if (isKillingAll.value || pluginsToKill.length === 0) return

  // 确认停止
  const confirmed = await confirm({
    title: '停止所有插件',
    message: `确定要停止所有运行中的插件吗？\n\n共有 ${pluginsToKill.length} 个插件正在运行。`,
    type: 'warning',
    confirmText: '停止',
    cancelText: '取消'
  })
  if (!confirmed) return

  isKillingAll.value = true
  try {
    // 获取要停止的插件路径列表
    const pluginPaths = pluginsToKill.map((p) => p.path)
    let successCount = 0
    let failCount = 0

    // 逐个停止插件
    for (const pluginPath of pluginPaths) {
      try {
        const result = await window.ztools.internal.killPlugin(pluginPath)
        if (result.success) {
          successCount++
        } else {
          failCount++
          console.error(`停止插件失败: ${pluginPath}`, result.error)
        }
      } catch (err) {
        failCount++
        console.error(`停止插件异常: ${pluginPath}`, err)
      }
    }

    // 重新加载运行状态
    await loadRunningPlugins()

    // 关闭更多菜单
    showMoreMenu.value = false

    // 显示结果
    if (failCount === 0) {
      success(`已停止所有插件（共 ${successCount} 个）`)
      // 停止成功后返回搜索主界面
      setTimeout(() => {
        window.ztools.hideWindow()
      }, 500)
    } else if (successCount === 0) {
      error(`停止失败（共 ${failCount} 个）`)
    } else {
      error(`部分停止失败：成功 ${successCount} 个，失败 ${failCount} 个`)
    }
  } catch (err: any) {
    console.error('停止所有插件失败:', err)
    error(`停止所有插件失败: ${err.message || '未知错误'}`)
  } finally {
    isKillingAll.value = false
  }
}

// 打开插件
async function handleOpenPlugin(plugin: any): Promise<void> {
  try {
    const result = await window.ztools.internal.launch({
      path: plugin.path,
      type: 'plugin',
      name: plugin.title || plugin.name, // 传递插件名称
      param: {}
    })

    // 检查返回结果
    if (result && !result.success) {
      error(`无法打开插件: ${result.error || '未知错误'}`)
    }
  } catch (err: any) {
    console.error('打开插件失败:', err)
    error(`打开插件失败: ${err.message || '未知错误'}`)
  }
}

// 打开插件目录
async function handleOpenFolder(plugin: any): Promise<void> {
  try {
    await window.ztools.internal.revealInFinder(plugin.path)
  } catch (err: any) {
    console.error('打开目录失败:', err)
    error(`打开目录失败: ${err.message || '未知错误'}`)
  }
}

// 重载插件
async function handleReloadPlugin(plugin: any): Promise<void> {
  if (isReloading.value) return

  isReloading.value = true
  try {
    const result = await window.ztools.internal.reloadPlugin(plugin.path)
    if (result.success) {
      // 重新加载插件列表
      await loadPlugins()
      // 注意：插件重载后，主程序会自动刷新指令列表
      success('插件重载成功!')
    } else {
      error(`插件重载失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('重载插件失败:', err)
    error(`重载插件失败: ${err.message || '未知错误'}`)
  } finally {
    isReloading.value = false
  }
}

// 从详情页面重载插件（重载后刷新 selectedPlugin）
async function handleReloadPluginFromDetail(plugin: any): Promise<void> {
  if (isReloading.value) return

  isReloading.value = true
  try {
    const result = await window.ztools.internal.reloadPlugin(plugin.path)
    if (result.success) {
      await loadPlugins()
      // 更新 selectedPlugin 引用
      const updated = plugins.value.find((p) => p.path === plugin.path)
      if (updated) {
        selectedPlugin.value = updated
      }
      success('插件重载成功!')
    } else {
      error(`插件重载失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('重载插件失败:', err)
    error(`重载插件失败: ${err.message || '未知错误'}`)
  } finally {
    isReloading.value = false
  }
}

// 打包插件
async function handlePackagePlugin(plugin: any): Promise<void> {
  if (isPackaging.value) return

  isPackaging.value = true
  try {
    const result = await window.ztools.internal.packagePlugin(plugin.path)
    if (result.success) {
      success('插件打包成功!')
    } else if (result.error !== '已取消') {
      error(`插件打包失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('打包插件失败:', err)
    error(`打包插件失败: ${err.message || '未知错误'}`)
  } finally {
    isPackaging.value = false
  }
}

// 处理 ESC 按键
function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (showNpmPanel.value) {
      e.stopPropagation()
      closeNpmPanel()
    } else if (showMoreMenu.value) {
      e.stopPropagation()
      showMoreMenu.value = false
    } else if (isDetailVisible.value) {
      e.stopPropagation()
      closePluginDetail()
    }
  }
}

// 处理点击外部关闭更多菜单
function handleClickOutside(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.more-menu-wrapper')) {
    showMoreMenu.value = false
  }
}

// 初始化时加载插件列表
onMounted(async () => {
  try {
    const data = await window.ztools.internal.dbGet(PINNED_PLUGINS_KEY)
    pinnedPluginPaths.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.error('加载置顶列表失败:', e)
  }
  await loadPlugins()
  // 如果有需要自动打开的插件，加载完成后打开详情
  tryAutoOpenPlugin()
  // 如果有需要自动添加的开发插件，加载完成后添加
  tryAutoAddDevPlugin()
  window.addEventListener('keydown', handleKeydown, true)
  window.addEventListener('click', handleClickOutside)

  // 监听插件进入事件，确保每次进入时刷新状态
  window.ztools.onPluginEnter(async (action) => {
    console.log('PluginCenter: 插件进入，刷新状态')
    // 重新加载插件列表和运行状态
    await loadPlugins()
    // 如果详情页面打开，同步更新 selectedPlugin
    if (isDetailVisible.value && selectedPlugin.value) {
      const updated = plugins.value.find((p) => p.path === selectedPlugin.value?.path)
      if (updated) {
        selectedPlugin.value = updated
      }
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('click', handleClickOutside)
})

// 监听 autoOpenPluginName 变化（从其他页面导航过来时）
watch(
  () => props.autoOpenPluginName,
  (name) => {
    if (name) {
      tryAutoOpenPlugin()
    }
  }
)

// 监听添加开发插件文件路径
watch(
  () => props.addDevPluginFilePath,
  (filePath) => {
    if (filePath) {
      tryAutoAddDevPlugin()
    }
  }
)

// 尝试自动打开指定插件的详情
function tryAutoOpenPlugin(): void {
  const name = props.autoOpenPluginName
  if (!name || plugins.value.length === 0) return

  const plugin = plugins.value.find((p) => p.name === name)
  if (plugin) {
    openPluginDetail(plugin)
    emit('auto-open-consumed')
  }
}

// 打开插件详情
function openPluginDetail(plugin: any): void {
  selectedPlugin.value = plugin
  isDetailVisible.value = true
}

// 关闭插件详情
function closePluginDetail(): void {
  isDetailVisible.value = false
  selectedPlugin.value = null
}

// 显示 npm 安装面板
function showNpmInstallPanel(): void {
  showNpmPanel.value = true
  isDetailVisible.value = true
  showMoreMenu.value = false
}

// 关闭 npm 安装面板
function closeNpmPanel(): void {
  if (isImportingNpm.value) return
  showNpmPanel.value = false
  isDetailVisible.value = false
  npmInstallPanelRef.value?.resetForm()
}

// 切换更多菜单
function toggleMoreMenu(): void {
  showMoreMenu.value = !showMoreMenu.value
}

// 关闭更多菜单
function closeMoreMenu(event?: Event): void {
  // 如果点击的是菜单项，不阻止事件
  if (event && (event.target as HTMLElement).closest('.more-menu-item')) {
    return
  }
  showMoreMenu.value = false
}

// 从 npm 安装插件
async function handleInstallFromNpm(data: {
  packageName: string
  useChinaMirror: boolean
}): Promise<void> {
  if (isImportingNpm.value) return

  isImportingNpm.value = true
  try {
    const result = await window.ztools.internal.installPluginFromNpm({
      packageName: data.packageName,
      useChinaMirror: data.useChinaMirror
    })
    if (result.success) {
      // 先设置加载状态为 false，这样 closeNpmPanel 才能正常关闭
      isImportingNpm.value = false
      // 重新加载插件列表
      await loadPlugins()
      // 关闭面板
      closeNpmPanel()
      // 显示成功提示
      success(`插件 "${data.packageName}" 安装成功！`)
    } else {
      error(`安装失败: ${result.error}`)
    }
  } catch (err: any) {
    console.error('从 npm 安装插件失败:', err)
    error(`安装失败: ${err.message || '未知错误'}`)
  } finally {
    isImportingNpm.value = false
  }
}
</script>

<style scoped>
.content-panel {
  position: relative; /* 使详情面板能够覆盖该区域 */
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止滑动时出现滚动条 */
}

/* 可滚动内容区 */
.scrollable-content {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  background: var(--bg-color);
}

/* 列表滑动动画 */
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

/* 插件中心样式 */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.tab-group {
  display: flex;
  gap: 6px;
  background: var(--control-bg);
  padding: 3px;
  border-radius: 8px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.tab-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.tab-btn.active {
  background: var(--active-bg);
  color: var(--primary-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--control-bg);
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.tab-btn.active .tab-count {
  background: var(--primary-light-bg);
  color: var(--primary-color);
}

.button-group {
  display: flex;
  gap: 10px;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.plugin-item:hover {
  background: var(--hover-bg);
  transform: translateX(2px);
}

.plugin-icon,
.plugin-icon-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  margin-right: 12px;
  flex-shrink: 0;
}

.plugin-icon {
  object-fit: cover;
}

.plugin-icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--active-bg);
  font-size: 24px;
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.plugin-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-version {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 2px 6px;
  background: var(--active-bg);
  border-radius: 4px;
}

.dev-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  color: var(--purple-color);
  background: var(--purple-light-bg);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--purple-border);
}

.running-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--success-color);
  background: var(--success-light-bg);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--success-color);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success-color);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.plugin-desc {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 图标按钮颜色样式 */
.open-btn {
  color: var(--primary-color);
}

.open-btn:hover {
  background: var(--primary-light-bg);
}

.kill-btn {
  color: var(--warning-color);
}

.kill-btn:hover:not(:disabled) {
  background: var(--warning-light-bg);
}

.folder-btn {
  color: var(--primary-color);
}

.folder-btn:hover {
  background: var(--primary-light-bg);
}

.reload-btn {
  color: var(--primary-color);
}

.reload-btn:hover:not(:disabled) {
  background: var(--primary-light-bg);
}

.pin-btn {
  color: var(--text-secondary);
}

.pin-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.pin-btn.is-pinned {
  color: var(--primary-color);
}

.pin-btn.is-pinned:hover {
  background: var(--primary-light-bg);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.3;
  color: var(--text-secondary);
}

.empty-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-secondary);
}
.empty-feature {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 更多菜单样式 */
.more-menu-wrapper {
  position: relative;
  z-index: 10000;
}

.more-menu-wrapper .btn-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.more-menu-wrapper .btn-more svg {
  flex-shrink: 0;
}

.more-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: #ffffff;
  border: 1px solid var(--divider-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 180px;
  padding: 4px;
  z-index: 10001;
}

@media (prefers-color-scheme: dark) {
  .more-menu {
    background: #1e1e1e;
  }
}

.more-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 14px;
  text-align: left;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.more-menu-item:hover:not(:disabled) {
  background: var(--hover-bg);
}

.more-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.more-menu-item svg {
  flex-shrink: 0;
}

.more-menu-item.kill-all-item:not(:disabled) {
  color: var(--warning-color);
}

.more-menu-item.kill-all-item:hover:not(:disabled) {
  background: var(--warning-light-bg);
}
</style>
