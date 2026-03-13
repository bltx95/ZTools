import { BrowserWindow, clipboard, ipcMain, nativeImage } from 'electron'
import fs from 'fs'
import path from 'path'
import type ClipboardManager from '../../managers/clipboardManager'
import type { PluginManager } from '../../managers/pluginManager'
import type WindowManagerInstance from '../../managers/windowManager'
import { ClipboardMonitor, WindowManager } from '../../core/native/index.js'

/**
 * 输入事件API - 插件专用
 */
export class PluginInputAPI {
  private pluginManager: PluginManager | null = null
  /** 窗口管理器，用于隐藏主窗口和获取主窗口引用 */
  private windowManager: typeof WindowManagerInstance | null = null
  /** 剪贴板管理器，用于在 paste 操作前暂停剪贴板监听 */
  private clipboardManager: typeof ClipboardManager | null = null
  private foundInPageListeners = new WeakSet<Electron.WebContents>()

  public init(
    pluginManager: PluginManager,
    windowManager: typeof WindowManagerInstance,
    clipboardManager: typeof ClipboardManager
  ): void {
    this.pluginManager = pluginManager
    this.windowManager = windowManager
    this.clipboardManager = clipboardManager
    this.setupIPC()
  }

  private setupIPC(): void {
    // 发送输入事件到插件
    ipcMain.handle(
      'send-input-event',
      (
        _event,
        inputEvent:
          | Electron.MouseInputEvent
          | Electron.MouseWheelInputEvent
          | Electron.KeyboardInputEvent
      ) => this.sendInputEvent(inputEvent)
    )

    // 模拟键盘按键
    ipcMain.on('simulate-keyboard-tap', (event, key: string, modifiers: string[]) => {
      event.returnValue = this.simulateKeyboardTap(key, modifiers)
    })

    // 模拟鼠标移动
    ipcMain.on('simulate-mouse-move', (event, x: number, y: number) => {
      event.returnValue = this.simulateMouseMove(x, y)
    })

    // 模拟鼠标左键单击
    ipcMain.on('simulate-mouse-click', (event, x: number, y: number) => {
      event.returnValue = this.simulateMouseClick(x, y)
    })

    // 模拟鼠标左键双击
    ipcMain.on('simulate-mouse-double-click', (event, x: number, y: number) => {
      event.returnValue = this.simulateMouseDoubleClick(x, y)
    })

    // 模拟鼠标右键单击
    ipcMain.on('simulate-mouse-right-click', (event, x: number, y: number) => {
      event.returnValue = this.simulateMouseRightClick(x, y)
    })

    // 检查当前插件是否处于开发模式
    ipcMain.on('is-dev', (event) => {
      event.returnValue = this.pluginManager?.isPluginDev(event.sender.id) ?? false
    })

    // 获取当前 WebContents ID
    ipcMain.on('get-web-contents-id', (event) => {
      event.returnValue = event.sender.id
    })

    // 在当前插件页面中查找文本
    ipcMain.handle('find-in-page', (event, text: string, options?: Electron.FindInPageOptions) => {
      try {
        const webContents = event.sender
        if (webContents.isDestroyed()) {
          return { success: false, error: '页面已销毁' }
        }
        // 确保监听 found-in-page 事件以转发结果
        this.ensureFoundInPageListener(webContents)
        const requestId = webContents.findInPage(text, options)
        return { success: true, requestId }
      } catch (error: unknown) {
        console.error('[PluginInput] 页面内查找失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    })

    // 停止页面内查找
    ipcMain.handle(
      'stop-find-in-page',
      (event, action: 'clearSelection' | 'keepSelection' | 'activateSelection') => {
        try {
          const webContents = event.sender
          if (webContents.isDestroyed()) {
            return { success: false, error: '页面已销毁' }
          }
          webContents.stopFindInPage(action)
          return { success: true }
        } catch (error: unknown) {
          console.error('[PluginInput] 停止页面内查找失败:', error)
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
          }
        }
      }
    )

    // 隐藏窗口并粘贴文本到外部应用
    ipcMain.on('hide-main-window-paste-text', (event, text: string) => {
      if (this.isDetachedWindowCall(event)) {
        event.returnValue = false
        return
      }
      if (typeof text !== 'string') {
        event.returnValue = false
        return
      }

      this.windowManager!.hideWindow(true)
      // 暂停剪贴板监听，防止写入剪贴板时自我触发
      this.clipboardManager!.temporaryCancelWatch()
      clipboard.writeText(String(text))
      // 延迟 50ms 等待剪贴板写入完成后再模拟粘贴
      setTimeout(() => {
        WindowManager.simulatePaste()
      }, 50)
      event.returnValue = true
    })

    // 隐藏窗口并粘贴图片到外部应用
    ipcMain.on('hide-main-window-paste-image', (event, img: string | Uint8Array) => {
      if (this.isDetachedWindowCall(event)) {
        event.returnValue = false
        return
      }
      if (!img) {
        event.returnValue = false
        return
      }

      // 支持三种图片格式：base64 Data URL、文件路径、Uint8Array 缓冲区
      let nativeImg: Electron.NativeImage | undefined
      if (typeof img === 'string') {
        if (/^data:image\/([a-z]+);base64,/.test(img)) {
          // base64 Data URL 格式（如 "data:image/png;base64,..."）
          nativeImg = nativeImage.createFromDataURL(img)
        } else if (path.basename(img) !== img && fs.existsSync(img)) {
          // 文件路径格式（排除纯文件名，只接受路径）
          nativeImg = nativeImage.createFromPath(img)
        }
      } else if (typeof img === 'object' && img instanceof Uint8Array) {
        nativeImg = nativeImage.createFromBuffer(Buffer.from(img))
      }

      if (!nativeImg || nativeImg.isEmpty()) {
        event.returnValue = false
        return
      }

      this.windowManager!.hideWindow(true)
      this.clipboardManager!.temporaryCancelWatch()
      clipboard.writeImage(nativeImg)
      // 延迟 50ms 等待剪贴板写入完成后再模拟粘贴
      setTimeout(() => {
        WindowManager.simulatePaste()
      }, 50)
      event.returnValue = true
    })

    // 隐藏窗口并粘贴文件到外部应用
    ipcMain.on('hide-main-window-paste-file', (event, filePaths: string | string[]) => {
      if (this.isDetachedWindowCall(event)) {
        event.returnValue = false
        return
      }
      if (!filePaths) {
        event.returnValue = false
        return
      }

      let files = Array.isArray(filePaths) ? filePaths : [filePaths]
      files = files.filter((f) => fs.existsSync(f))
      if (files.length === 0) {
        event.returnValue = false
        return
      }

      this.windowManager!.hideWindow(true)
      this.clipboardManager!.temporaryCancelWatch()
      // 通过原生模块将文件列表写入系统剪贴板
      ClipboardMonitor.setClipboardFiles(files)
      // 延迟 50ms 等待剪贴板写入完成后再模拟粘贴
      setTimeout(() => {
        WindowManager.simulatePaste()
      }, 50)
      event.returnValue = true
    })

    // 隐藏窗口并模拟键入字符串到外部应用
    ipcMain.on('hide-main-window-type-string', (event, text: string) => {
      if (this.isDetachedWindowCall(event)) {
        event.returnValue = false
        return
      }
      if (typeof text !== 'string') {
        event.returnValue = false
        return
      }

      this.windowManager!.hideWindow(true)

      if (text) {
        // 使用 Intl.Segmenter 按字素簇拆分文本（正确处理 emoji 等多码点字符）
        const segments = [...new Intl.Segmenter().segment(text)]
        for (const seg of segments) {
          if (seg.segment === '\n') {
            // 换行符转为 Shift+Enter（适用于大多数应用的行内换行）
            WindowManager.simulateKeyboardTap('enter', 'shift')
          } else {
            // 通过原生 Unicode 输入法逐字符键入
            WindowManager.unicodeType(seg.segment)
          }
        }
      }
      event.returnValue = true
    })
  }

  /**
   * 检查调用者是否为分离窗口且聚焦（安全检查：分离窗口不应执行粘贴/输入操作）
   */
  private isDetachedWindowCall(event: Electron.IpcMainEvent): boolean {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win !== this.windowManager?.getMainWindow() && win.isFocused()) {
      return true
    }
    return false
  }

  private sendInputEvent(
    inputEvent:
      | Electron.MouseInputEvent
      | Electron.MouseWheelInputEvent
      | Electron.KeyboardInputEvent
  ): { success: boolean; error?: string } {
    try {
      if (this.pluginManager) {
        const result = this.pluginManager.sendInputEvent(inputEvent)
        if (result) {
          return { success: true }
        } else {
          return { success: false, error: '没有活动的插件' }
        }
      }
      return { success: false, error: '功能不可用' }
    } catch (error: unknown) {
      console.error('[PluginInput] 发送输入事件失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 确保 webContents 上注册了 found-in-page 事件监听，避免重复注册
   */
  private ensureFoundInPageListener(webContents: Electron.WebContents): void {
    if (this.foundInPageListeners.has(webContents)) return
    this.foundInPageListeners.add(webContents)
    webContents.on('found-in-page', (_event, result) => {
      if (!webContents.isDestroyed()) {
        webContents.send('found-in-page-result', result)
      }
    })
  }

  private simulateKeyboardTap(key: string, modifiers: string[] = []): boolean {
    try {
      return WindowManager.simulateKeyboardTap(key, ...modifiers)
    } catch (error: unknown) {
      console.error('[PluginInput] 模拟键盘按键失败:', error)
      return false
    }
  }

  private simulateMouseMove(x: number, y: number): boolean {
    try {
      return WindowManager.simulateMouseMove(x, y)
    } catch (error: unknown) {
      console.error('[PluginInput] 模拟鼠标移动失败:', error)
      return false
    }
  }

  private simulateMouseClick(x: number, y: number): boolean {
    try {
      return WindowManager.simulateMouseClick(x, y)
    } catch (error: unknown) {
      console.error('[PluginInput] 模拟鼠标单击失败:', error)
      return false
    }
  }

  private simulateMouseDoubleClick(x: number, y: number): boolean {
    try {
      return WindowManager.simulateMouseDoubleClick(x, y)
    } catch (error: unknown) {
      console.error('[PluginInput] 模拟鼠标双击失败:', error)
      return false
    }
  }

  private simulateMouseRightClick(x: number, y: number): boolean {
    try {
      return WindowManager.simulateMouseRightClick(x, y)
    } catch (error: unknown) {
      console.error('[PluginInput] 模拟鼠标右击失败:', error)
      return false
    }
  }
}

export default new PluginInputAPI()
