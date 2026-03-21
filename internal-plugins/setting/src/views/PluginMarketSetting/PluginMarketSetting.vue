<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useToast } from '@/components'
import { compareVersions, upgradeInstalledPluginFromMarket, weightedSearch } from '@/utils'
import { PluginDetail, PluginCard, CategoryCard, CategoryDetail } from './components'
import type { Plugin, CategoryInfo, CategoryLayoutSection } from './components'
import { useJumpFunction, useZtoolsSubInput } from '@/composables'
import { PluginMarketSettingJumpFunction } from '@/views/PluginMarketSetting/PluginMarketSetting'

const { success, error, confirm } = useToast()

interface BannerItem {
  image: string
  url?: string
  height?: number
}

interface CategorySummary {
  key: string
  title: string
  description?: string
  icon?: string
  showDescription: boolean
  pluginCount: number
}

interface StorefrontSection {
  type: 'banner' | 'navigation' | 'fixed' | 'random'
  key: string
  title?: string
  height?: number
  items?: BannerItem[]
  categories?: CategorySummary[]
  plugins?: Plugin[]
}

interface StorefrontCategoryPayload {
  key: string
  title: string
  description?: string
  icon?: string
  plugins: Array<{ name: string }>
}

interface StorefrontPayload {
  sections: StorefrontSection[]
  categories?: Record<string, StorefrontCategoryPayload>
  categoryLayouts?: Record<string, CategoryLayoutSection[]>
}

interface MarketPlugin extends Omit<Plugin, 'installed'> {
  platform?: string[]
}

interface InstalledPlugin {
  name: string
  path: string
  version: string
}

interface PluginMarketResponse {
  success: boolean
  data?: MarketPlugin[]
  storefront?: StorefrontPayload
  error?: string
}

const plugins = ref<Plugin[]>([])
const pluginMap = ref<Map<string, Plugin>>(new Map())
const storefrontSections = ref<StorefrontSection[]>([])
const storefrontCategories = ref<Record<string, CategoryInfo>>({})
const categoryLayouts = ref<Record<string, CategoryLayoutSection[]>>({})
const isLoading = ref(false)
const installingPlugin = ref<string | null>(null)

const { value: searchQuery, setSubInput } = useZtoolsSubInput('', '搜索插件市场...')

// 搜索模式：有搜索词时使用扁平搜索
const isSearchMode = computed(() => (searchQuery.value || '').trim().length > 0)

const filteredPlugins = computed(() =>
  weightedSearch(plugins.value, searchQuery.value || '', [
    { value: (p) => p.title || p.name || '', weight: 10 },
    { value: (p) => p.description || '', weight: 5 }
  ])
)

// 是否有 storefront 数据可用
const hasStorefront = computed(() => storefrontSections.value.length > 0)

// 插件详情面板状态
const isDetailVisible = ref(false)
const selectedPlugin = ref<Plugin | null>(null)

// 分类详情面板状态
const isCategoryDetailVisible = ref(false)
const selectedCategory = ref<CategoryInfo | null>(null)

// 是否显示主滚动内容（任一覆盖面板打开时隐藏）
const showScrollableContent = computed(
  () => !isDetailVisible.value && !isCategoryDetailVisible.value
)

// 将市场插件数据标记已安装状态
function enrichPlugins(
  marketPlugins: MarketPlugin[],
  installedPlugins: InstalledPlugin[],
  currentPlatform: string
): Plugin[] {
  return marketPlugins
    .filter((plugin) => {
      if (!plugin.platform || !Array.isArray(plugin.platform)) return true
      return plugin.platform.includes(currentPlatform)
    })
    .map((plugin) => {
      const installedPlugin = installedPlugins.find((item) => item.name === plugin.name)
      return {
        ...plugin,
        installed: !!installedPlugin,
        path: installedPlugin?.path,
        localVersion: installedPlugin?.version
      }
    })
}

async function fetchPlugins(): Promise<void> {
  isLoading.value = true
  try {
    const currentPlatform = window.ztools.internal.getPlatform()
    const [marketResult, installedPlugins] = await Promise.all([
      window.ztools.internal.fetchPluginMarket(),
      window.ztools.internal.getPlugins()
    ])

    const typedMarketResult = marketResult as PluginMarketResponse
    const typedInstalledPlugins = installedPlugins as InstalledPlugin[]

    if (typedMarketResult.success && typedMarketResult.data) {
      const marketPlugins = typedMarketResult.data

      // 构建带安装状态的插件扁平列表（用于搜索）
      plugins.value = enrichPlugins(marketPlugins, typedInstalledPlugins, currentPlatform)

      // 构建 pluginMap
      const pMap = new Map<string, Plugin>()
      for (const p of plugins.value) {
        if (p.name) pMap.set(p.name, p)
      }
      pluginMap.value = pMap

      // 构建 storefront sections
      storefrontCategories.value = {}
      categoryLayouts.value = {}

      if (typedMarketResult.storefront?.sections) {
        // 处理 categories（从后端返回的完整分类数据）
        if (typedMarketResult.storefront.categories) {
          const cats: Record<string, CategoryInfo> = {}
          for (const [key, cat] of Object.entries(typedMarketResult.storefront.categories)) {
            const categoryPlugins = cat.plugins
              .map((plugin) => pMap.get(plugin.name))
              .filter((plugin): plugin is Plugin => !!plugin)
            cats[key] = {
              key: cat.key,
              title: cat.title,
              description: cat.description,
              icon: cat.icon,
              plugins: categoryPlugins
            }
          }
          storefrontCategories.value = cats
        }

        // 处理 categoryLayouts
        if (typedMarketResult.storefront.categoryLayouts) {
          categoryLayouts.value = typedMarketResult.storefront.categoryLayouts
        }

        // 处理 sections：将 fixed/random 中的插件替换为带安装状态的版本
        storefrontSections.value = typedMarketResult.storefront.sections
          .map((section) => {
            if (
              (section.type === 'fixed' || section.type === 'random') &&
              Array.isArray(section.plugins)
            ) {
              return {
                ...section,
                plugins: section.plugins
                  .map((p) => pMap.get(p.name))
                  .filter((p): p is Plugin => !!p)
              }
            }
            return section
          })
          .filter((section) =>
            section.type === 'banner'
              ? (section.items?.length ?? 0) > 0
              : section.type === 'navigation'
                ? (section.categories?.length ?? 0) > 0
                : (section.plugins?.length ?? 0) > 0
          )
      } else {
        storefrontSections.value = []
      }
    } else {
      console.error('获取插件市场列表失败:', typedMarketResult.error)
    }
  } catch (error) {
    console.error('获取插件列表出错:', error)
  } finally {
    isLoading.value = false
  }
}

function openPluginDetail(plugin: Plugin): void {
  selectedPlugin.value = plugin
  isDetailVisible.value = true
}

function closePluginDetail(): void {
  isDetailVisible.value = false
  selectedPlugin.value = null
}

function openCategoryDetail(categorySummary: CategorySummary): void {
  const category = storefrontCategories.value[categorySummary.key]
  if (category) {
    selectedCategory.value = category
    isCategoryDetailVisible.value = true
  }
}

function closeCategoryDetail(): void {
  isCategoryDetailVisible.value = false
  selectedCategory.value = null
}

async function handleOpenPlugin(plugin: Plugin): Promise<void> {
  if (!plugin.path) {
    error('无法打开插件: 路径未知')
    return
  }
  try {
    const result = await window.ztools.internal.launch({
      path: plugin.path,
      type: 'plugin',
      name: plugin.title || plugin.name,
      param: {}
    })

    if (result && !result.success) {
      error(`无法打开插件: ${result.error || '未知错误'}`)
    }
  } catch (err: unknown) {
    console.error('打开插件失败:', err)
    error(`打开插件失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }
}

function canUpgrade(plugin: Plugin): boolean {
  if (!plugin.installed || !plugin.localVersion || !plugin.version) return false
  return compareVersions(plugin.localVersion, plugin.version) < 0
}

async function handleUpgradePlugin(plugin: Plugin): Promise<void> {
  if (installingPlugin.value) return
  if (!plugin.path) {
    error('无法升级：找不到插件路径')
    return
  }

  const confirmUpgrade = await confirm({
    title: '升级插件',
    message: `发现新版本 ${plugin.version}，当前版本 ${plugin.localVersion}，是否升级？\n\n升级将先卸载旧版本。`,
    type: 'warning',
    confirmText: '升级',
    cancelText: '取消'
  })
  if (!confirmUpgrade) return

  installingPlugin.value = plugin.name
  try {
    const upgradeResult = await upgradeInstalledPluginFromMarket(
      { name: plugin.name, path: plugin.path },
      plugin
    )
    if (upgradeResult.success) {
      plugin.installed = true
      plugin.localVersion = plugin.version
      if (upgradeResult.plugin && upgradeResult.plugin.path) {
        plugin.path = upgradeResult.plugin.path
      }
      await fetchPlugins()
    } else {
      throw new Error(upgradeResult.error || '升级失败')
    }
  } catch (err: unknown) {
    console.error('升级出错:', err)
    error(`升级出错: ${err instanceof Error ? err.message : '未知错误'}`)
    await fetchPlugins()
  } finally {
    installingPlugin.value = null
  }
}

async function downloadPlugin(plugin: Plugin): Promise<void> {
  if (installingPlugin.value) return

  installingPlugin.value = plugin.name
  try {
    const result = await window.ztools.internal.installPluginFromMarket(
      JSON.parse(JSON.stringify(plugin))
    )
    if (result.success) {
      plugin.installed = true
      plugin.localVersion = plugin.version
      if (result.plugin && result.plugin.path) {
        plugin.path = result.plugin.path
      }
    } else {
      console.error('插件安装失败:', result.error)
      error(`安装失败: ${result.error}`)
    }
  } catch (err: unknown) {
    console.error('安装出错:', err)
    error(`安装出错: ${err instanceof Error ? err.message : '未知错误'}`)
  } finally {
    installingPlugin.value = null
  }
}

async function handleUninstallPlugin(plugin: Plugin): Promise<void> {
  if (!plugin.path) {
    error('无法卸载：找不到插件路径')
    return
  }

  try {
    const deleteResult = await window.ztools.internal.deletePlugin(plugin.path)
    if (!deleteResult.success) {
      error(`卸载失败: ${deleteResult.error}`)
      return
    }

    success('插件卸载成功')

    plugin.installed = false
    plugin.localVersion = undefined
    plugin.path = undefined

    closePluginDetail()
    await fetchPlugins()
  } catch (err: unknown) {
    console.error('卸载出错:', err)
    error(`卸载出错: ${err instanceof Error ? err.message : '未知错误'}`)
  }
}

function handleBannerClick(item: BannerItem): void {
  if (item.url) {
    window.open(item.url, '_blank')
  }
}

// 处理 ESC 按键 - 逐级返回
function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (isDetailVisible.value) {
      e.stopPropagation()
      closePluginDetail()
    } else if (isCategoryDetailVisible.value) {
      e.stopPropagation()
      closeCategoryDetail()
    }
  }
}

// 获取分类的布局配置
function getCategoryLayout(categoryKey: string): CategoryLayoutSection[] {
  return categoryLayouts.value[categoryKey] || categoryLayouts.value['default'] || []
}

useJumpFunction<PluginMarketSettingJumpFunction>((state) => {
  if (state.payload && state.type === 'over') {
    setSubInput(state.payload)
  }
})

onMounted(() => {
  fetchPlugins()
  window.addEventListener('keydown', handleKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>
<template>
  <div class="plugin-market">
    <!-- 可滚动内容区 -->
    <Transition name="list-slide">
      <div v-show="showScrollableContent" class="scrollable-content">
        <div v-if="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <span>加载中...</span>
        </div>

        <!-- 搜索模式：扁平网格 -->
        <template v-else-if="isSearchMode">
          <div v-if="filteredPlugins.length === 0" class="empty-state">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
              <path
                d="M16 16L20 20"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>未找到匹配的插件</span>
          </div>
          <div v-else class="market-grid">
            <PluginCard
              v-for="plugin in filteredPlugins"
              :key="plugin.name"
              :plugin="plugin"
              :installing-plugin="installingPlugin"
              :can-upgrade="canUpgrade(plugin)"
              @click="openPluginDetail(plugin)"
              @open="handleOpenPlugin(plugin)"
              @download="downloadPlugin(plugin)"
              @upgrade="handleUpgradePlugin(plugin)"
            />
          </div>
        </template>

        <!-- 首页模式：storefront 布局 -->
        <template v-else-if="hasStorefront">
          <div class="storefront">
            <template v-for="section in storefrontSections" :key="section.key">
              <!-- Banner 区块 -->
              <div v-if="section.type === 'banner'" class="storefront-banner">
                <div
                  v-for="(item, idx) in section.items"
                  :key="idx"
                  class="banner-item"
                  :class="{ clickable: !!item.url }"
                  :style="section.height ? { height: `${section.height}px` } : undefined"
                  @click="handleBannerClick(item)"
                >
                  <img :src="item.image" alt="" class="banner-image" draggable="false" />
                </div>
              </div>

              <!-- 分类导航区块 -->
              <div v-else-if="section.type === 'navigation'" class="storefront-section">
                <div v-if="section.title" class="section-header">
                  <span class="section-title">{{ section.title }}</span>
                </div>
                <div class="navigation-grid">
                  <CategoryCard
                    v-for="cat in section.categories"
                    :key="cat.key"
                    :title="cat.title"
                    :description="cat.description"
                    :icon="cat.icon"
                    :show-description="cat.showDescription"
                    :plugin-count="cat.pluginCount"
                    @click="openCategoryDetail(cat)"
                  />
                </div>
              </div>

              <!-- Fixed / Random 区块 -->
              <div
                v-else-if="section.type === 'fixed' || section.type === 'random'"
                class="storefront-section"
              >
                <div v-if="section.title" class="section-header">
                  <span class="section-title">{{ section.title }}</span>
                </div>
                <div class="market-grid">
                  <PluginCard
                    v-for="plugin in section.plugins"
                    :key="plugin.name"
                    :plugin="plugin"
                    :installing-plugin="installingPlugin"
                    :can-upgrade="canUpgrade(plugin)"
                    @click="openPluginDetail(plugin)"
                    @open="handleOpenPlugin(plugin)"
                    @download="downloadPlugin(plugin)"
                    @upgrade="handleUpgradePlugin(plugin)"
                  />
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- 降级模式：无 storefront 时平铺展示 -->
        <template v-else>
          <div v-if="plugins.length === 0" class="empty-state">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
              <path
                d="M16 16L20 20"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>暂无插件</span>
          </div>
          <div v-else class="market-grid">
            <PluginCard
              v-for="plugin in plugins"
              :key="plugin.name"
              :plugin="plugin"
              :installing-plugin="installingPlugin"
              :can-upgrade="canUpgrade(plugin)"
              @click="openPluginDetail(plugin)"
              @open="handleOpenPlugin(plugin)"
              @download="downloadPlugin(plugin)"
              @upgrade="handleUpgradePlugin(plugin)"
            />
          </div>
        </template>
      </div>
    </Transition>

    <!-- 分类详情覆盖面板 -->
    <Transition name="slide">
      <div
        v-if="isCategoryDetailVisible && selectedCategory"
        class="category-panel-container"
        :class="{ 'shifted-left': isDetailVisible }"
      >
        <CategoryDetail
          :category="selectedCategory"
          :layout="getCategoryLayout(selectedCategory.key)"
          :installing-plugin="installingPlugin"
          :plugin-map="pluginMap"
          :can-upgrade="canUpgrade"
          @back="closeCategoryDetail"
          @click-plugin="openPluginDetail"
          @open-plugin="handleOpenPlugin"
          @download-plugin="downloadPlugin"
          @upgrade-plugin="handleUpgradePlugin"
        />
      </div>
    </Transition>

    <!-- 插件详情覆盖面板组件 -->
    <Transition name="slide">
      <PluginDetail
        v-if="isDetailVisible && selectedPlugin"
        :plugin="selectedPlugin"
        :is-loading="installingPlugin === selectedPlugin.name"
        @back="closePluginDetail"
        @open="handleOpenPlugin(selectedPlugin)"
        @download="downloadPlugin(selectedPlugin)"
        @upgrade="handleUpgradePlugin(selectedPlugin)"
        @uninstall="handleUninstallPlugin(selectedPlugin)"
      />
    </Transition>
  </div>
</template>

<style scoped>
.plugin-market {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

/* Storefront 布局 */
.storefront {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Banner */
.storefront-banner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.banner-item {
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.banner-item.clickable {
  cursor: pointer;
}
.banner-item.clickable:hover {
  opacity: 0.92;
}
.banner-image {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 12px;
  object-fit: cover;
}

/* Section 通用 */
.storefront-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

/* 分类详情容器（支持左移动画） */
.category-panel-container {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: var(--bg-color);
  transition: transform 0.2s ease-out;
}

.category-panel-container.shifted-left {
  transform: translateX(-100%);
}

/* 分类导航网格 */
.navigation-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

/* 插件网格 */
.market-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 12px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--divider-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-state span {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 12px;
  color: var(--text-secondary);
}

.empty-state svg {
  opacity: 0.4;
}

.empty-state span {
  font-size: 13px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
