/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

// 类型定义文件：定义 ZTools 设置插件可用的 API

// Preload services 类型声明（对应 public/preload/services.js）
interface Services {
  readFile: (file: string) => string
  writeTextFile: (text: string) => string
  writeImageFile: (base64Url: string) => string | undefined
}

declare global {
  interface Window {
    services: Services
    ztools: {
      // 获取拖放文件的路径（Electron webUtils）
      getPathForFile: (file: File) => string

      internal: {
        // 数据库操作（主程序专用，直接操作 ZTOOLS 命名空间）
        dbPut: (key: string, data: any) => Promise<any>
        dbGet: (key: string) => Promise<any>

        // 插件管理
        getPlugins: () => Promise<
          Array<{
            name: string
            path: string
            version: string
            description?: string
            logo?: string
            features?: any[]
            isDevelopment?: boolean
          }>
        >
        getAllPlugins: () => Promise<
          Array<{
            name: string
            path: string
            version: string
            description?: string
            logo?: string
            features?: any[]
            isDevelopment?: boolean
          }>
        >
        getRunningPlugins: () => Promise<string[]>
        selectPluginFile: () => Promise<{ success: boolean; filePath?: string; error?: string }>
        importPlugin: () => Promise<{ success: boolean; error?: string }>
        readPluginInfoFromZpx: (zpxPath: string) => Promise<{
          success: boolean
          pluginInfo?: {
            name: string
            title: string
            version: string
            description: string
            author: string
            logo: string
            features: Array<{ code: string; explain?: string }>
            isInstalled: boolean
          }
          error?: string
        }>
        installPluginFromPath: (zpxPath: string) => Promise<{
          success: boolean
          error?: string
          plugin?: any
        }>
        importDevPlugin: (pluginJsonPath?: string) => Promise<{ success: boolean; error?: string }>
        deletePlugin: (pluginPath: string) => Promise<{ success: boolean; error?: string }>
        killPlugin: (pluginPath: string) => Promise<{ success: boolean; error?: string }>
        reloadPlugin: (pluginPath: string) => Promise<{ success: boolean; error?: string }>
        revealInFinder: (filePath: string) => Promise<void>
        launch: (options: {
          path: string
          type?: 'direct' | 'plugin' | 'builtin'
          featureCode?: string
          param?: any
          name?: string
        }) => Promise<{ success: boolean; error?: string }>
        quitApp: () => Promise<{ success: boolean }>
        openApp: (appPath: string) => Promise<void>

        // 插件市场
        fetchPluginMarket: () => Promise<{ success: boolean; data?: any; error?: string }>
        installPluginFromMarket: (plugin: any) => Promise<{
          success: boolean
          error?: string
          plugin?: any
        }>
        installPluginFromNpm: (options: {
          packageName: string
          useChinaMirror?: boolean
        }) => Promise<{
          success: boolean
          error?: string
          plugin?: any
        }>

        // 插件数据管理
        getPluginReadme: (pluginPath: string) => Promise<{
          success: boolean
          content?: string
          error?: string
        }>
        getPluginDocKeys: (pluginName: string) => Promise<{
          success: boolean
          data?: Array<{ key: string; type: 'document' | 'attachment' }>
          error?: string
        }>
        getPluginDoc: (
          pluginName: string,
          key: string
        ) => Promise<{
          success: boolean
          data?: any
          type?: 'document' | 'attachment'
          error?: string
        }>
        getPluginDataStats: () => Promise<{
          success: boolean
          data?: Array<{
            pluginName: string
            pluginTitle: string | null
            docCount: number
            attachmentCount: number
            logo: string | null
          }>
          error?: string
        }>
        clearPluginData: (pluginName: string) => Promise<{
          success: boolean
          deletedCount?: number
          error?: string
        }>
        packagePlugin: (pluginPath: string) => Promise<{
          success: boolean
          error?: string
        }>
        getPluginMemoryInfo: (pluginPath: string) => Promise<{
          success: boolean
          data?: {
            private: number
            shared: number
            total: number
          } | null
          error?: string
        }>

        // 快捷键相关
        startHotkeyRecording: () => Promise<{ success: boolean; error?: string }>
        updateShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>
        getCurrentShortcut: () => Promise<string>
        registerGlobalShortcut: (
          shortcut: string,
          target: string
        ) => Promise<{ success: boolean; error?: string }>
        unregisterGlobalShortcut: (shortcut: string) => Promise<{
          success: boolean
          error?: string
        }>
        registerAppShortcut: (
          shortcut: string,
          target: string
        ) => Promise<{ success: boolean; error?: string }>
        unregisterAppShortcut: (shortcut: string) => Promise<{
          success: boolean
          error?: string
        }>
        onHotkeyRecorded: (callback: (shortcut: string) => void) => void

        // 窗口和设置
        setWindowOpacity: (opacity: number) => Promise<void>
        setWindowDefaultHeight: (height: number) => Promise<void>
        setWindowMaterial: (material: 'mica' | 'acrylic' | 'none') => Promise<{ success: boolean }>
        getWindowMaterial: () => Promise<'mica' | 'acrylic' | 'none'>
        onUpdateWindowMaterial: (callback: (material: 'mica' | 'acrylic' | 'none') => void) => void
        updateAcrylicOpacity: (lightOpacity: number, darkOpacity: number) => Promise<void>
        updatePlaceholder: (placeholder: string) => Promise<void>
        selectAvatar: () => Promise<{ success: boolean; path?: string; error?: string }>
        updateAvatar: (avatar: string) => Promise<void>
        updateAutoPaste: (autoPaste: string) => Promise<void>
        updateAutoClear: (autoClear: string) => Promise<void>
        updateAutoBackToSearch: (autoBackToSearch: string) => Promise<void>
        updateShowRecentInSearch: (showRecentInSearch: boolean) => Promise<void>
        updateLocalAppSearch: (enabled: boolean) => Promise<void>
        updateRecentRows: (rows: number) => Promise<void>
        updatePinnedRows: (rows: number) => Promise<void>
        updateSearchMode: (searchMode: 'aggregate' | 'list') => Promise<void>
        updateTabTarget: (target: string) => Promise<void>
        updateSpaceOpenCommand: (enabled: boolean) => Promise<void>
        updateFloatingBallDoubleClickCommand: (command: string) => Promise<void>
        setTheme: (theme: string) => Promise<void>
        updatePrimaryColor: (primaryColor: string, customColor?: string) => Promise<void>
        setTrayIconVisible: (visible: boolean) => Promise<void>
        setFloatingBallEnabled: (enabled: boolean) => Promise<{ success: boolean }>
        setFloatingBallLetter: (letter: string) => Promise<{ success: boolean }>
        getFloatingBallLetter: () => Promise<string>
        setLaunchAtLogin: (enable: boolean) => Promise<void>
        getLaunchAtLogin: () => Promise<boolean>
        setProxyConfig: (config: { enabled: boolean; url: string }) => Promise<{
          success: boolean
          error?: string
        }>

        // 系统信息
        getAppVersion: () => Promise<string>
        getAppName: () => Promise<string>
        getSystemVersions: () => Promise<NodeJS.ProcessVersions>
        getPlatform: () => NodeJS.Platform
        isWindows11: () => Promise<boolean>

        // 软件更新
        updaterCheckUpdate: () => Promise<{
          hasUpdate: boolean
          latestVersion?: string
          updateInfo?: any
          error?: string
        }>
        updaterStartUpdate: (updateInfo: any) => Promise<{
          success: boolean
          error?: string
        }>
        updaterSetAutoCheck: (enabled: boolean) => Promise<{
          success: boolean
          error?: string
        }>

        // 指令管理
        getCommands: () => Promise<{
          commands: any[]
          regexCommands: any[]
          plugins: any[]
        }>

        // 本地启动管理
        localShortcuts: {
          getAll: () => Promise<
            Array<{
              id: string
              name: string
              alias?: string
              path: string
              type: 'file' | 'folder' | 'app'
              icon?: string
              keywords?: string[]
              pinyin?: string
              pinyinAbbr?: string
              addedAt: number
            }>
          >
          add: (type: 'file' | 'folder') => Promise<{ success: boolean; error?: string }>
          addByPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
          delete: (id: string) => Promise<{ success: boolean; error?: string }>
          open: (path: string) => Promise<{ success: boolean; error?: string }>
          updateAlias: (id: string, alias: string) => Promise<{ success: boolean; error?: string }>
        }

        // 图片分析
        analyzeImage: (imagePath: string) => Promise<{
          isSimpleIcon: boolean
          mainColor: string | null
          isDark: boolean
          needsAdaptation: boolean
        }>

        // WebDAV 同步
        syncGetConfig: () => Promise<{
          success: boolean
          config?: {
            enabled: boolean
            serverUrl: string
            username: string
            password: string
            syncInterval: number
            lastSyncTime: number
          }
          error?: string
        }>
        syncGetUnsyncedCount: () => Promise<{
          success: boolean
          count?: number
          error?: string
        }>
        syncStopAutoSync: () => Promise<{
          success: boolean
          error?: string
        }>
        syncTestConnection: (config: {
          serverUrl: string
          username: string
          password: string
        }) => Promise<{
          success: boolean
          error?: string
        }>
        syncSaveConfig: (config: {
          enabled: boolean
          serverUrl: string
          username: string
          password: string
          syncInterval: number
        }) => Promise<{
          success: boolean
          error?: string
        }>
        syncPerformSync: () => Promise<{
          success: boolean
          result?: {
            uploaded: number
            downloaded: number
            errors: number
          }
          error?: string
        }>
        syncForceDownloadFromCloud: () => Promise<{
          success: boolean
          result?: {
            downloaded: number
            errors: number
          }
          error?: string
        }>

        // AI 模型管理
        aiModels: {
          getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>
          add: (model: any) => Promise<{ success: boolean; error?: string }>
          update: (model: any) => Promise<{ success: boolean; error?: string }>
          delete: (id: string) => Promise<{ success: boolean; error?: string }>
        }

        // 网页快开
        webSearch: {
          getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>
          add: (engine: any) => Promise<{ success: boolean; error?: string }>
          update: (engine: any) => Promise<{ success: boolean; error?: string }>
          delete: (id: string) => Promise<{ success: boolean; error?: string }>
          fetchFavicon: (
            url: string
          ) => Promise<{ success: boolean; data?: string; error?: string }>
        }

        // 超级面板
        updateSuperPanelConfig: (config: {
          enabled: boolean
          mouseButton: string
          longPressMs: number
        }) => Promise<{ success: boolean }>
        pinToSuperPanel: (command: any) => Promise<{ success: boolean; error?: string }>
        unpinSuperPanelCommand: (
          path: string,
          featureCode?: string
        ) => Promise<{ success: boolean; error?: string }>
        getSuperPanelPinned: () => Promise<any[]>

        // 通知主渲染进程禁用指令列表已更改
        notifyDisabledCommandsChanged: () => Promise<{ success: boolean }>

        // 固定/取消固定指令到搜索窗口
        pinApp: (app: any) => Promise<void>
        unpinApp: (appPath: string, featureCode?: string, name?: string) => Promise<void>

        // HTTP 服务
        httpServerGetConfig: () => Promise<{
          success: boolean
          config?: {
            enabled: boolean
            port: number
            apiKey: string
          }
          error?: string
        }>
        httpServerSaveConfig: (config: {
          enabled: boolean
          port: number
          apiKey: string
        }) => Promise<{
          success: boolean
          config?: {
            enabled: boolean
            port: number
            apiKey: string
          }
          error?: string
        }>
        httpServerRegenerateKey: () => Promise<{
          success: boolean
          apiKey?: string
          error?: string
        }>
        httpServerStatus: () => Promise<{
          success: boolean
          running?: boolean
          error?: string
        }>

        // 调试日志
        logEnable: () => Promise<{ success: boolean }>
        logDisable: () => Promise<{ success: boolean }>
        logGetBuffer: () => Promise<
          Array<{
            id: number
            timestamp: number
            level: string
            source: string
            message: string
          }>
        >
        logIsEnabled: () => Promise<boolean>
        logSubscribe: () => Promise<{ success: boolean }>
        onLogEntries: (
          callback: (
            entries: Array<{
              id: number
              timestamp: number
              level: string
              source: string
              message: string
            }>
          ) => void
        ) => void
        offLogEntries: (callback: (...args: any[]) => void) => void
      }
    }
  }
}

export {}
