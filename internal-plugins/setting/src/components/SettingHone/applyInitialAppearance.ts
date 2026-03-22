import {
  applyPrimaryColor,
  normalizePrimaryColor,
  normalizeTheme,
  normalizeWindowMaterial
} from '@/utils'

type AppearanceSettings = {
  theme?: unknown
  primaryColor?: unknown
  customColor?: unknown
  windowMaterial?: unknown
}

type ThemeValue = 'system' | 'light' | 'dark'
type WindowMaterialValue = 'mica' | 'acrylic' | 'none'

export type ApplyInitialAppearanceDeps = {
  dbGet: (key: string) => Promise<AppearanceSettings | undefined>
  setTheme: (theme: ThemeValue) => Promise<void>
  setWindowMaterial: (material: WindowMaterialValue) => Promise<{ success: boolean }>
  isWindows: boolean
}

export async function applyInitialAppearance(deps: ApplyInitialAppearanceDeps): Promise<void> {
  // 启动时从通用设置读取外观，保持与设置页持久化字段一致。
  const data = await deps.dbGet('settings-general')
  const theme = normalizeTheme(data?.theme)
  const primaryColor = normalizePrimaryColor(data?.primaryColor)
  const customColor = typeof data?.customColor === 'string' ? data.customColor : undefined

  await deps.setTheme(theme)
  applyPrimaryColor(primaryColor, customColor)

  if (!deps.isWindows) {
    return
  }

  // 窗口材质仅在 Windows 生效，且需兼容旧版本或异常持久化值。
  const material = normalizeWindowMaterial(data?.windowMaterial)
  await deps.setWindowMaterial(material)
  document.documentElement.setAttribute('data-material', material)
}
