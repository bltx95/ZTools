import { BrowserWindow, ipcMain, Menu, screen } from 'electron'
import floatingBallHtml from '../../../resources/floatingBall.html?asset'
import databaseAPI from '../api/shared/database'
import windowManager from '../managers/windowManager'

// 悬浮球尺寸
const BALL_SIZE = 48

/**
 * 悬浮球管理器
 * 创建一个始终置顶的小圆球窗口，点击可切换主窗口显示/隐藏
 */
class FloatingBallManager {
  private ballWindow: BrowserWindow | null = null
  private enabled = false
  // 拖拽状态：记录拖拽开始时鼠标相对窗口左上角的偏移
  private dragOffsetX = 0
  private dragOffsetY = 0

  /**
   * 初始化悬浮球管理器
   * 从数据库加载配置，决定是否创建悬浮球
   */
  public async init(): Promise<void> {
    this.setupIPC()
    await this.loadConfig()
  }

  /**
   * 从数据库加载悬浮球配置
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await databaseAPI.dbGet('settings-general')
      this.enabled = data?.floatingBallEnabled ?? false

      if (this.enabled) {
        await this.createBallWindow()

        // 恢复保存的位置
        const savedPos = data?.floatingBallPosition
        if (savedPos && this.ballWindow) {
          this.ballWindow.setPosition(savedPos.x, savedPos.y, false)
        }
      }

      console.log('悬浮球配置已加载, enabled:', this.enabled)
    } catch (error) {
      console.error('加载悬浮球配置失败:', error)
    }
  }

  /**
   * 设置 IPC 处理器
   */
  private setupIPC(): void {
    // 悬浮球被点击 → 切换主窗口
    ipcMain.on('floating-ball-click', () => {
      this.handleBallClick()
    })

    // 拖拽开始 → 记录鼠标相对窗口的偏移
    ipcMain.on(
      'floating-ball-drag-start',
      (_event, data: { mouseScreenX: number; mouseScreenY: number }) => {
        if (!this.ballWindow || this.ballWindow.isDestroyed()) return
        const [winX, winY] = this.ballWindow.getPosition()
        this.dragOffsetX = data.mouseScreenX - winX
        this.dragOffsetY = data.mouseScreenY - winY
      }
    )

    // 拖拽中 → 移动窗口
    ipcMain.on(
      'floating-ball-dragging',
      (_event, data: { screenX: number; screenY: number }) => {
        if (!this.ballWindow || this.ballWindow.isDestroyed()) return
        const newX = data.screenX - this.dragOffsetX
        const newY = data.screenY - this.dragOffsetY
        this.ballWindow.setPosition(newX, newY, false)
      }
    )

    // 拖拽结束 → 保存位置
    ipcMain.on('floating-ball-drag-end', () => {
      this.savePosition()
    })

    // 右键菜单
    ipcMain.on('floating-ball-contextmenu', () => {
      this.showContextMenu()
    })

    // 文件拖放到悬浮球
    ipcMain.on(
      'floating-ball-file-drop',
      (_event, files: Array<{ path: string; name: string; isDirectory: boolean }>) => {
        this.handleFileDrop(files)
      }
    )

    // 外部控制：显示/隐藏悬浮球
    ipcMain.handle('floating-ball:set-enabled', async (_event, enabled: boolean) => {
      return this.setEnabled(enabled)
    })

    // 外部控制：获取悬浮球状态
    ipcMain.handle('floating-ball:get-enabled', () => {
      return this.enabled
    })
  }

  /**
   * 创建悬浮球窗口
   */
  private async createBallWindow(): Promise<void> {
    if (this.ballWindow && !this.ballWindow.isDestroyed()) {
      this.ballWindow.show()
      return
    }

    // 获取主显示器工作区（放在屏幕右边中间）
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight, x: workAreaX, y: workAreaY } =
      primaryDisplay.workArea

    const x = workAreaX + screenWidth - BALL_SIZE - 8
    const y = workAreaY + Math.floor(screenHeight / 2) - Math.floor(BALL_SIZE / 2)

    this.ballWindow = new BrowserWindow({
      width: BALL_SIZE,
      height: BALL_SIZE,
      x,
      y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      type: 'panel',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    })

    // macOS 上设置窗口层级为浮动面板（高于普通窗口）
    this.ballWindow.setAlwaysOnTop(true, 'floating')
    // 所有工作空间都可见
    this.ballWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // 加载悬浮球页面
    this.ballWindow.loadFile(floatingBallHtml)

    // 防止窗口被意外关闭
    this.ballWindow.on('close', (event) => {
      if (this.enabled) {
        event.preventDefault()
      }
    })

    console.log('悬浮球窗口已创建')
  }

  /**
   * 处理悬浮球点击
   */
  private handleBallClick(): void {
    const mainWindow = windowManager.getMainWindow()
    if (!mainWindow) return

    if (mainWindow.isVisible()) {
      windowManager.hideWindow(false)
    } else {
      windowManager.showWindow()
    }
  }

  /**
   * 处理文件拖放到悬浮球
   * 显示主窗口并将文件数据发送给渲染进程（等同于复制文件后打开搜索框粘贴）
   */
  private handleFileDrop(files: Array<{ path: string; name: string; isDirectory: boolean }>): void {
    const mainWindow = windowManager.getMainWindow()
    if (!mainWindow) return

    // 显示主窗口
    windowManager.showWindow()

    // 延迟发送文件数据，确保 focus-search 事件及其处理器完全执行完毕
    // showWindow() 会触发 show 事件 → focus-search，其处理器会清空 pastedFilesData
    // 如果不延迟，floating-ball-files 可能先于 focus-search 到达渲染进程，
    // 导致设置的文件数据被 focus-search 处理器清空
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('floating-ball-files', files)
        console.log('悬浮球文件拖放:', files.length, '个文件')
      }
    }, 500)
  }

  /**
   * 保存悬浮球位置到数据库
   */
  private async savePosition(): Promise<void> {
    if (!this.ballWindow || this.ballWindow.isDestroyed()) return

    const [x, y] = this.ballWindow.getPosition()

    try {
      const data = (await databaseAPI.dbGet('settings-general')) || {}
      data.floatingBallPosition = { x, y }
      await databaseAPI.dbPut('settings-general', data)
      console.log('悬浮球位置已保存:', { x, y })
    } catch (error) {
      console.error('保存悬浮球位置失败:', error)
    }
  }

  /**
   * 显示右键菜单
   */
  private showContextMenu(): void {
    if (!this.ballWindow) return

    const menu = Menu.buildFromTemplate([
      {
        label: '显示/隐藏 ZTools',
        click: () => {
          this.handleBallClick()
        }
      },
      { type: 'separator' },
      {
        label: '隐藏悬浮球',
        click: () => {
          this.setEnabled(false)
        }
      }
    ])

    menu.popup({ window: this.ballWindow })
  }

  /**
   * 设置悬浮球启用/禁用
   */
  public async setEnabled(enabled: boolean): Promise<{ success: boolean }> {
    this.enabled = enabled

    if (enabled) {
      await this.createBallWindow()
    } else {
      this.destroyBallWindow()
    }

    // 保存到数据库
    try {
      const data = (await databaseAPI.dbGet('settings-general')) || {}
      data.floatingBallEnabled = enabled
      await databaseAPI.dbPut('settings-general', data)
      console.log('悬浮球已', enabled ? '启用' : '禁用')
    } catch (error) {
      console.error('保存悬浮球设置失败:', error)
    }

    return { success: true }
  }

  /**
   * 销毁悬浮球窗口
   */
  private destroyBallWindow(): void {
    if (this.ballWindow && !this.ballWindow.isDestroyed()) {
      this.enabled = false // 先标记为禁用，避免 close 事件 preventDefault
      this.ballWindow.destroy()
      this.ballWindow = null
      console.log('悬浮球窗口已销毁')
    }
  }

  /**
   * 获取悬浮球是否启用
   */
  public isEnabled(): boolean {
    return this.enabled
  }

  /**
   * 应用退出时清理
   */
  public cleanup(): void {
    this.destroyBallWindow()
  }
}

// 导出单例
export default new FloatingBallManager()
