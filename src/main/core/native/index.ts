import os from 'os'
import macZToolsNative from '../../../../resources/lib/mac/ztools_native.node?asset'
import winZToolsNative from '../../../../resources/lib/win/ztools_native.node?asset'

// 根据平台加载对应的原生模块
const platform = os.platform()
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(platform === 'darwin' ? macZToolsNative : winZToolsNative)

// 原生模块接口类型定义
interface UwpAppInfo {
  name: string
  appId: string
  icon: string
  installLocation: string
}

interface NativeAddon {
  startMonitor: (callback: () => void) => void
  stopMonitor: () => void
  startWindowMonitor: (callback: (windowInfo: WindowInfo) => void) => void
  stopWindowMonitor: () => void
  getActiveWindow: () => ActiveWindowResult | null
  activateWindow: (identifier: string | number) => boolean
  simulatePaste: () => boolean
  simulateKeyboardTap: (key: string, ...modifiers: string[]) => boolean
  startRegionCapture: (
    callback: (result: { success: boolean; width?: number; height?: number }) => void
  ) => void
  getClipboardFiles: () => ClipboardFile[]
  setClipboardFiles: (files: Array<string | { path: string }>) => boolean
  simulateMouseMove: (x: number, y: number) => boolean
  simulateMouseClick: (x: number, y: number) => boolean
  simulateMouseDoubleClick: (x: number, y: number) => boolean
  simulateMouseRightClick: (x: number, y: number) => boolean
  startMouseMonitor: (
    buttonType: MouseButtonType,
    longPressMs: number,
    callback: () => void
  ) => void
  stopMouseMonitor: () => void
  getUwpApps: () => UwpAppInfo[]
  launchUwpApp: (appId: string) => boolean
  getFileIcon: (filePath: string, size: number) => Buffer | null
  resolveMuiStrings: (refs: string[]) => { [ref: string]: string }
  startColorPicker: (callback: (result: { success: boolean; hex: string | null }) => void) => void
  stopColorPicker: () => void
  /** 通过 Unicode 输入法模拟键入单个字符/字素簇 */
  unicodeType: (segment: string) => boolean
}

interface WindowInfo {
  app: string // 应用名称（如 "Finder.app"）
  bundleId?: string // macOS 独有
  pid?: number // 进程ID (macOS 和 Windows 都有)
  title?: string // 窗口标题
  x?: number // 窗口 x 坐标
  y?: number // 窗口 y 坐标
  width?: number // 窗口宽度
  height?: number // 窗口高度
  appPath?: string // 应用路径
}

interface ActiveWindowResult {
  app: string
  bundleId?: string
  pid?: number
  error?: string
}

interface ClipboardFile {
  path: string
  name: string
  isDirectory: boolean
}

// 鼠标按钮类型
type MouseButtonType = 'middle' | 'right' | 'back' | 'forward'

/**
 * 剪贴板监控类
 */
export class ClipboardMonitor {
  private _callback: (() => void) | null = null
  private _isMonitoring = false

  /**
   * 启动剪贴板监控
   * @param callback - 剪贴板变化时的回调函数（无参数）
   */
  start(callback: () => void): void {
    if (this._isMonitoring) {
      throw new Error('Monitor is already running')
    }

    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function')
    }

    this._callback = callback
    this._isMonitoring = true
    ;(addon as NativeAddon).startMonitor(() => {
      if (this._callback) {
        this._callback()
      }
    })
  }

  /**
   * 停止剪贴板监控
   */
  stop(): void {
    if (!this._isMonitoring) {
      return
    }

    ;(addon as NativeAddon).stopMonitor()
    this._isMonitoring = false
    this._callback = null
  }

  /**
   * 是否正在监控
   */
  get isMonitoring(): boolean {
    return this._isMonitoring
  }

  /**
   * 获取剪贴板中的文件列表
   * @returns {Array<{path: string, name: string, isDirectory: boolean}>} 文件列表
   * - path: 文件完整路径
   * - name: 文件名
   * - isDirectory: 是否是目录
   */
  static getClipboardFiles(): ClipboardFile[] {
    if (platform === 'win32') {
      return (addon as NativeAddon).getClipboardFiles()
    } else if (platform === 'darwin') {
      // macOS 暂不支持
      throw new Error('getClipboardFiles is not yet supported on macOS')
    }
    return []
  }

  /**
   * 设置剪贴板中的文件列表
   * @param {Array<string|{path: string}>} files - 文件路径数组
   * - 支持直接传递字符串路径数组: ['C:\\file1.txt', 'C:\\file2.txt']
   * - 支持传递对象数组: [{path: 'C:\\file1.txt'}, {path: 'C:\\file2.txt'}]
   * @returns {boolean} 是否设置成功
   * @example
   * // 使用字符串数组
   * ClipboardMonitor.setClipboardFiles(['C:\\test.txt', 'C:\\folder']);
   *
   * // 使用对象数组（兼容 getClipboardFiles 的返回格式）
   * const files = ClipboardMonitor.getClipboardFiles();
   * ClipboardMonitor.setClipboardFiles(files);
   */
  static setClipboardFiles(files: Array<string | { path: string }>): boolean {
    if (!Array.isArray(files)) {
      throw new TypeError('files must be an array')
    }

    if (files.length === 0) {
      throw new Error('files array cannot be empty')
    }

    if (platform === 'win32' || platform === 'darwin') {
      return (addon as NativeAddon).setClipboardFiles(files)
    }
    return false
  }
}

/**
 * 窗口监控类
 */
export class WindowMonitor {
  private _callback: ((windowInfo: WindowInfo) => void) | null = null
  private _isMonitoring = false

  /**
   * 启动窗口监控
   * @param callback - 窗口切换时的回调函数
   * - macOS: { app, bundleId, title, x, y, width, height, appPath, pid }
   * - Windows: { app, pid, title, x, y, width, height, appPath }
   */
  start(callback: (windowInfo: WindowInfo) => void): void {
    if (this._isMonitoring) {
      throw new Error('Window monitor is already running')
    }

    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function')
    }

    this._callback = callback
    this._isMonitoring = true
    ;(addon as NativeAddon).startWindowMonitor((windowInfo) => {
      if (this._callback) {
        this._callback(windowInfo)
      }
    })
  }

  /**
   * 停止窗口监控
   */
  stop(): void {
    if (!this._isMonitoring) {
      return
    }

    ;(addon as NativeAddon).stopWindowMonitor()
    this._isMonitoring = false
    this._callback = null
  }

  /**
   * 是否正在监控
   */
  get isMonitoring(): boolean {
    return this._isMonitoring
  }
}

/**
 * 窗口管理类
 */
export class WindowManager {
  /**
   * 获取当前激活的窗口信息
   * @returns 窗口信息对象
   * - macOS: { app, bundleId, pid }
   * - Windows: { app, pid }
   */
  static getActiveWindow(): { app: string; bundleId?: string; pid?: number } | null {
    const result = (addon as NativeAddon).getActiveWindow()
    if (!result || result.error) {
      return null
    }
    return result
  }

  /**
   * 根据标识符激活指定应用的窗口
   * @param identifier - 应用标识符
   * - macOS: bundleId (string)
   * - Windows: processId (number)
   * @returns 是否激活成功
   */
  static activateWindow(identifier: string | number): boolean {
    if (platform === 'darwin') {
      // macOS: bundleId 是字符串
      if (typeof identifier !== 'string') {
        throw new TypeError('On macOS, identifier must be a bundleId (string)')
      }
    } else if (platform === 'win32') {
      // Windows: processId 是数字
      if (typeof identifier !== 'number') {
        throw new TypeError('On Windows, identifier must be a processId (number)')
      }
    }
    return (addon as NativeAddon).activateWindow(identifier)
  }

  /**
   * 获取当前平台
   * @returns 'darwin' | 'win32'
   */
  static getPlatform(): string {
    return platform
  }

  /**
   * 模拟粘贴操作（Command+V on macOS, Ctrl+V on Windows）
   * @returns {boolean} 是否成功
   */
  static simulatePaste(): boolean {
    return (addon as NativeAddon).simulatePaste()
  }

  /**
   * 模拟键盘按键
   * @param {string} key - 要模拟的按键
   * @param {...string} modifiers - 修饰键（shift、ctrl、alt、meta）
   * @returns {boolean} 是否成功
   * @example
   * // 模拟按下字母 'a'
   * WindowManager.simulateKeyboardTap('a');
   *
   * // 模拟 Command+C (macOS) 或 Ctrl+C (Windows)
   * WindowManager.simulateKeyboardTap('c', 'meta');
   *
   * // 模拟 Shift+Tab
   * WindowManager.simulateKeyboardTap('tab', 'shift');
   *
   * // 模拟 Command+Shift+S (macOS)
   * WindowManager.simulateKeyboardTap('s', 'meta', 'shift');
   */
  static simulateKeyboardTap(key: string, ...modifiers: string[]): boolean {
    if (typeof key !== 'string' || !key) {
      throw new TypeError('key must be a non-empty string')
    }
    return (addon as NativeAddon).simulateKeyboardTap(key, ...modifiers)
  }

  /**
   * 模拟 Unicode 字符输入（逐字符输入，类似输入法）
   * @param {string} segment - 要输入的字符/字素簇
   * @returns {boolean} 是否成功
   */
  static unicodeType(segment: string): boolean {
    return (addon as NativeAddon).unicodeType(segment)
  }

  /**
   * 模拟鼠标移动到指定屏幕位置
   * @param x 距离屏幕左侧的位置（像素）
   * @param y 距离屏幕顶部的位置（像素）
   * @returns 是否成功
   */
  static simulateMouseMove(x: number, y: number): boolean {
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError('x and y must be numbers')
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('x and y must be finite numbers')
    }
    return (addon as NativeAddon).simulateMouseMove(x, y)
  }

  /**
   * 模拟鼠标左键单击
   * @param x 距离屏幕左侧的位置（像素）
   * @param y 距离屏幕顶部的位置（像素）
   * @returns 是否成功
   */
  static simulateMouseClick(x: number, y: number): boolean {
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError('x and y must be numbers')
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('x and y must be finite numbers')
    }
    return (addon as NativeAddon).simulateMouseClick(x, y)
  }

  /**
   * 模拟鼠标左键双击
   * @param x 距离屏幕左侧的位置（像素）
   * @param y 距离屏幕顶部的位置（像素）
   * @returns 是否成功
   */
  static simulateMouseDoubleClick(x: number, y: number): boolean {
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError('x and y must be numbers')
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('x and y must be finite numbers')
    }
    return (addon as NativeAddon).simulateMouseDoubleClick(x, y)
  }

  /**
   * 模拟鼠标右键单击
   * @param x 距离屏幕左侧的位置（像素）
   * @param y 距离屏幕顶部的位置（像素）
   * @returns 是否成功
   */
  static simulateMouseRightClick(x: number, y: number): boolean {
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError('x and y must be numbers')
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('x and y must be finite numbers')
    }
    return (addon as NativeAddon).simulateMouseRightClick(x, y)
  }
}

/**
 * 鼠标监控类
 */
export class MouseMonitor {
  private static _callback: (() => void) | null = null
  private static _isMonitoring = false

  /**
   * 启动鼠标监控
   * @param buttonType - 按钮类型：'middle' | 'right' | 'back' | 'forward'
   * @param longPressMs - 长按阈值（毫秒）
   *   - 0: 监听点击（mouseUp 时触发）
   *   - >0: 监听长按（按住达到该时长后触发）
   *   - 注意：'right' 只支持长按（longPressMs 必须 > 0）
   * @param callback - 鼠标事件回调函数
   * - 参数: 无
   */
  static start(buttonType: MouseButtonType, longPressMs: number, callback: () => void): void {
    if (MouseMonitor._isMonitoring) {
      throw new Error('Mouse monitor is already running')
    }

    const validButtons: MouseButtonType[] = ['middle', 'right', 'back', 'forward']
    if (!validButtons.includes(buttonType)) {
      throw new TypeError(`buttonType must be one of: ${validButtons.join(', ')}`)
    }

    if (typeof longPressMs !== 'number' || longPressMs < 0) {
      throw new TypeError('longPressMs must be a non-negative number')
    }

    if (buttonType === 'right' && longPressMs === 0) {
      throw new TypeError("'right' button only supports long press (longPressMs must be > 0)")
    }

    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function')
    }

    MouseMonitor._callback = callback
    MouseMonitor._isMonitoring = true
    ;(addon as NativeAddon).startMouseMonitor(buttonType, longPressMs, () => {
      if (MouseMonitor._callback) {
        MouseMonitor._callback()
      }
    })
  }

  /**
   * 停止鼠标监控
   */
  static stop(): void {
    if (!MouseMonitor._isMonitoring) {
      return
    }

    ;(addon as NativeAddon).stopMouseMonitor()
    MouseMonitor._isMonitoring = false
    MouseMonitor._callback = null
  }

  /**
   * 是否正在监控
   */
  static get isMonitoring(): boolean {
    return MouseMonitor._isMonitoring
  }
}

/**
 * 区域截图类
 */
export class ScreenCapture {
  /**
   * 启动区域截图
   * @param {Function} callback - 截图完成时的回调函数
   * - 参数: { success: boolean, width?: number, height?: number, x?: number, y?: number }
   * - success: 是否成功截图
   * - width: 截图宽度（成功时）
   * - height: 截图高度（成功时）
   * - x: 截图左上角 x 坐标（成功时，macOS 暂不支持）
   * - y: 截图左上角 y 坐标（成功时，macOS 暂不支持）
   */
  static start(
    callback: (result: {
      success: boolean
      width?: number
      height?: number
      x?: number
      y?: number
    }) => void
  ): void {
    if (platform === 'darwin') {
      // macOS 暂不支持
      throw new Error('ScreenCapture is not yet supported on macOS')
    }

    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function')
    }

    ;(addon as NativeAddon).startRegionCapture((result) => {
      callback(result)
    })
  }
}

/**
 * UWP 应用管理类
 */
export class UwpManager {
  /**
   * 获取已安装的 UWP 应用列表
   * @returns {Array<{name: string, appId: string, icon: string, installLocation: string}>} 应用列表
   * - name: 应用显示名称
   * - appId: AppUserModelID（用于启动应用）
   * - icon: 应用图标路径
   * - installLocation: 应用安装目录
   */
  static getUwpApps(): UwpAppInfo[] {
    if (platform !== 'win32') {
      throw new Error('getUwpApps is only supported on Windows')
    }
    return (addon as NativeAddon).getUwpApps()
  }

  /**
   * 启动 UWP 应用
   * @param {string} appId - AppUserModelID（从 getUwpApps 获取）
   * @returns {boolean} 是否启动成功
   */
  static launchUwpApp(appId: string): boolean {
    if (platform !== 'win32') {
      throw new Error('launchUwpApp is only supported on Windows')
    }
    if (typeof appId !== 'string' || !appId) {
      throw new TypeError('appId must be a non-empty string')
    }
    return (addon as NativeAddon).launchUwpApp(appId)
  }
}

/**
 * 应用图标提取类
 */
export class IconExtractor {
  /**
   * 获取文件/应用的图标（PNG 格式 Buffer）
   * @param filePath - 文件路径（可以是 .exe、.lnk、.dll 或任何文件类型）
   * @param size - 图标尺寸：16 | 32 | 64 | 256，默认 32
   * @returns PNG 格式的图标数据，失败时返回 null
   */
  static getFileIcon(filePath: string, size: 16 | 32 | 64 | 256 = 32): Buffer | null {
    if (platform !== 'win32') {
      throw new Error('getFileIcon is only supported on Windows')
    }
    if (typeof filePath !== 'string' || !filePath) {
      throw new TypeError('filePath must be a non-empty string')
    }
    const validSizes = [16, 32, 64, 256]
    if (!validSizes.includes(size)) {
      throw new TypeError(`size must be one of: ${validSizes.join(', ')}`)
    }
    return (addon as NativeAddon).getFileIcon(filePath, size)
  }
}

/**
 * MUI 资源字符串解析类
 */
export class MuiResolver {
  /**
   * 批量解析 MUI 资源字符串
   * @param refs - MUI 引用字符串数组，如 ['@%SystemRoot%\\system32\\shell32.dll,-22067']
   * @returns 解析结果 Map，key 为原始引用，value 为解析后的本地化字符串
   */
  static resolve(refs: string[]): Map<string, string> {
    if (platform !== 'win32') {
      throw new Error('MuiResolver is only supported on Windows')
    }
    if (!Array.isArray(refs)) {
      throw new TypeError('refs must be an array of strings')
    }
    const result = (addon as NativeAddon).resolveMuiStrings(refs)
    return new Map(Object.entries(result))
  }
}

/**
 * 取色器类（仅 macOS）
 * 进入取色模式后，鼠标附近会出现 9x9 像素放大网格
 * 点击鼠标左键确认取色，按 ESC 键取消
 */
export class ColorPicker {
  private static _callback: ((result: { success: boolean; hex: string | null }) => void) | null =
    null
  private static _isActive = false

  /**
   * 启动取色器
   * @param callback - 取色完成时的回调函数
   * - 成功: { success: true, hex: '#59636E' }
   * - 取消: { success: false, hex: null }
   */
  static start(callback: (result: { success: boolean; hex: string | null }) => void): void {
    if (ColorPicker._isActive) {
      throw new Error('Color picker is already active')
    }

    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function')
    }

    ColorPicker._callback = callback
    ColorPicker._isActive = true
    ;(addon as NativeAddon).startColorPicker((result) => {
      ;(addon as NativeAddon).stopColorPicker()

      ColorPicker._isActive = false
      if (ColorPicker._callback) {
        const cb = ColorPicker._callback
        ColorPicker._callback = null
        cb(result)
      }
    })
  }

  /**
   * 停止取色器（手动取消）
   */
  static stop(): void {
    if (!ColorPicker._isActive) {
      return
    }

    ;(addon as NativeAddon).stopColorPicker()
    ColorPicker._isActive = false
    ColorPicker._callback = null
  }

  /**
   * 是否正在取色
   */
  static get isActive(): boolean {
    return ColorPicker._isActive
  }
}

// 为了向后兼容，默认导出 ClipboardMonitor
export default ClipboardMonitor

// 导出类型
export type { ClipboardFile, WindowInfo, ActiveWindowResult, MouseButtonType, UwpAppInfo }
