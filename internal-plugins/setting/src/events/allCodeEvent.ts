import { addZtoolsCodeEventListener } from '@/events/codeEvent'
import { jumpFunctionPluginInstaller } from '@/views/PluginInstaller/PluginInstaller'
import { jumpFunctionPluginMarketSetting } from '@/views/PluginMarketSetting/PluginMarketSetting'
import { jumpFunctionPluginsSetting } from '@/views/PluginsSetting/PluginsSetting'

/**
 * 将文件和文件夹添加到本地启动
 */
addZtoolsCodeEventListener('function.local-launch-add', (e) => {
  const { payload, code } = e.pluginEnterParams
  console.info(`[code-event] ${code} 成功接收事件`)
  const files = Array.isArray(payload) ? payload : []
  const pendingFiles = files
    .map((file: { path?: string }) => file.path?.trim())
    .filter((path): path is string => Boolean(path))
  void e.router.replace({
    name: e.getParamsKey('router'),
    query: { _t: Date.now() },
    state: { pendingFiles }
  })
})

/**
 * 添加开发中插件
 */
addZtoolsCodeEventListener('function.add-dev-plugin', (e) => {
  const { payload, code } = e.pluginEnterParams
  console.info(`[code-event] ${code} 成功接收事件`)
  const files = Array.isArray(payload) ? payload : []
  if (files.length > 0) {
    void e.router.replace({
      name: e.getParamsKey('router'),
      query: { _t: Date.now() },
      state: { localAddDevPluginFilePath: files[0].path }
    })
  }
})

/**
 * 插件市场搜索
 */
addZtoolsCodeEventListener('function.plugin-market-search', async (e) => {
  const { payload, code } = e.pluginEnterParams
  console.info(`[code-event] ${code} 成功接收事件`, payload)
  const pluginList = await window.ztools.internal.getPlugins()
  if (payload) {
    const pluginInfo = pluginList.find((item) => item.name === payload)
    console.log(pluginInfo)
    if (pluginInfo) {
      jumpFunctionPluginsSetting({ autoOpenPluginName: payload })
    } else {
      jumpFunctionPluginMarketSetting({ autoOpenPluginName: payload })
    }
  }
})

/**
 * 安装插件
 */
addZtoolsCodeEventListener('function.install-plugin', (e) => {
  const { payload, code } = e.pluginEnterParams
  console.info(`[code-event] ${code} 成功接收事件`)
  const files = Array.isArray(payload) ? payload : []
  const installFilePaths = files
    .map((file: { path?: string }) => file.path?.trim())
    .filter((path): path is string => Boolean(path))

  if (files && files.length > 0) {
    console.log({ installFilePath: installFilePaths[0] })
    jumpFunctionPluginInstaller({ installFilePath: installFilePaths[0] })
  }
})

/**
 * 退出 ZTools 应用
 */
addZtoolsCodeEventListener('function.exit', () => {
  void window.ztools.internal.quitApp()
})
