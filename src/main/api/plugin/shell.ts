import { ipcMain, shell } from 'electron'
import { getFileIconAsBase64 } from '../../core/iconProtocol'

/**
 * Shell API - 插件专用
 * 提供系统 shell 相关操作
 */
export class PluginShellAPI {
  public init(): void {
    this.setupIPC()
  }

  private setupIPC(): void {
    // 使用系统默认程序打开 URL
    ipcMain.on('shell-open-external', async (event, url: string) => {
      try {
        await shell.openExternal(url)
        event.returnValue = { success: true }
      } catch (error: unknown) {
        console.error('[PluginShell] 打开 URL 失败:', error)
        event.returnValue = {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })

    // 在文件管理器中显示文件
    ipcMain.on('shell-show-item-in-folder', (event, fullPath: string) => {
      try {
        shell.showItemInFolder(fullPath)
      } catch (error: unknown) {
        console.error('[PluginShell] 在文件管理器中显示文件失败:', error)
      }
      event.returnValue = undefined
    })

    // 使用系统默认方式打开文件或文件夹
    ipcMain.on('shell-open-path', async (event, fullPath: string) => {
      try {
        const errorMessage = await shell.openPath(fullPath)
        event.returnValue = {
          success: !errorMessage,
          error: errorMessage || undefined
        }
      } catch (error: unknown) {
        console.error('[PluginShell] 使用系统默认方式打开文件失败:', error)
        event.returnValue = {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })

    // 获取文件系统图标（返回 base64 Data URL，同步）
    ipcMain.on('get-file-icon', (event, filePath: string) => {
      try {
        event.returnValue = getFileIconAsBase64(filePath)
      } catch (error: unknown) {
        console.error('[PluginShell] 获取文件图标失败:', filePath, error)
        event.returnValue = null
      }
    })

    // 将文件移动到回收站（异步）
    ipcMain.handle('shell-trash-item', async (_event, fullPath: string) => {
      try {
        await shell.trashItem(fullPath)
        return { success: true }
      } catch (error: unknown) {
        console.error('[PluginShell] 移动文件到回收站失败:', fullPath, error)
        throw new Error(error instanceof Error ? error.message : '移动文件到回收站失败')
      }
    })
  }
}

export default new PluginShellAPI()
