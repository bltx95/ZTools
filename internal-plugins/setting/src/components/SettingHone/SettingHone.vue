<script setup lang="ts">
import { LeftMenu } from '@/components'
import { onMounted } from 'vue'
import { applyPrimaryColor, normalizePrimaryColor, normalizeTheme } from '@/utils'

async function applyTheme(): Promise<void> {
  try {
    const data = await window.ztools.internal.dbGet('settings-general')
    const theme = normalizeTheme(data?.theme)
    const primaryColor = normalizePrimaryColor(data?.primaryColor)
    const customColor = typeof data?.customColor === 'string' ? data.customColor : undefined

    await window.ztools.internal.setTheme(theme)
    applyPrimaryColor(primaryColor, customColor)
  } catch (error) {
    console.error('初始化主题失败:', error)
  }
}

onMounted(() => {
  void applyTheme()
})
</script>

<template>
  <div class="setting-hone">
    <div class="setting-hone-menu">
      <LeftMenu />
    </div>
    <div class="w-full setting-hone-content">
      <router-view />
    </div>
  </div>
</template>

<style lang="less" scoped>
.setting-hone {
  height: 100vh;
  display: flex;
  &-menu {
    height: 100%;
    min-height: 0;
  }

  &-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}
</style>
