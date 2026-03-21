<script setup lang="ts">
import { computed } from 'vue'
import { DetailPanel } from '@/components'
import { PluginCard } from '../PluginCard'
import type { Plugin, CategoryInfo, CategoryLayoutSection } from '../types'

const props = defineProps<{
  category: CategoryInfo
  layout: CategoryLayoutSection[]
  installingPlugin: string | null
  pluginMap: Map<string, Plugin>
  canUpgrade: (plugin: Plugin) => boolean
}>()

defineEmits<{
  (e: 'back'): void
  (e: 'click-plugin', plugin: Plugin): void
  (e: 'open-plugin', plugin: Plugin): void
  (e: 'download-plugin', plugin: Plugin): void
  (e: 'upgrade-plugin', plugin: Plugin): void
}>()

function interpolateTemplate(template: string): string {
  return template
    .replace(/\$\{title\}/g, props.category.title)
    .replace(/\$\{count\}/g, String(props.category.plugins.length))
}

interface ResolvedSection {
  key: string
  title?: string
  plugins: Plugin[]
}

const resolvedSections = computed<ResolvedSection[]>(() => {
  if (props.layout.length === 0) {
    return [{ key: 'all', plugins: props.category.plugins }]
  }

  const sections: ResolvedSection[] = []

  for (let i = 0; i < props.layout.length; i++) {
    const section = props.layout[i]
    const title = section.title ? interpolateTemplate(section.title) : undefined

    if (section.type === 'list') {
      sections.push({
        key: `list-${i}`,
        title,
        plugins: props.category.plugins
      })
    } else if (section.type === 'fixed') {
      const pluginNames = section.plugins || []
      const fixedPlugins = pluginNames
        .map((name) => props.pluginMap.get(name))
        .filter((p): p is Plugin => !!p)
      if (fixedPlugins.length > 0) {
        sections.push({ key: `fixed-${i}`, title, plugins: fixedPlugins })
      }
    } else if (section.type === 'random') {
      const count = section.count || 4
      const shuffled = [...props.category.plugins]
      for (let k = shuffled.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1))
        ;[shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]
      }
      sections.push({
        key: `random-${i}`,
        title,
        plugins: shuffled.slice(0, count)
      })
    }
  }

  return sections
})
</script>
<template>
  <DetailPanel :title="category.title" @back="$emit('back')">
    <div class="category-detail-content">
      <div v-if="category.description" class="category-detail-header">
        <img
          v-if="category.icon"
          :src="category.icon"
          alt=""
          class="category-detail-icon"
          draggable="false"
        />
        <div class="category-detail-desc">{{ category.description }}</div>
      </div>

      <div v-for="section in resolvedSections" :key="section.key" class="category-detail-section">
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
            @click="$emit('click-plugin', plugin)"
            @open="$emit('open-plugin', plugin)"
            @download="$emit('download-plugin', plugin)"
            @upgrade="$emit('upgrade-plugin', plugin)"
          />
        </div>
      </div>
    </div>
  </DetailPanel>
</template>

<style scoped>
.category-detail-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.category-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 2px;
}

.category-detail-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.category-detail-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.category-detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  padding: 0 2px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.market-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
</style>
