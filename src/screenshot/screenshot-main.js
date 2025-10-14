/**
 * 截屏主控制器
 * 整合所有子模块，协调截屏功能的各个部分
 */

import '@tabler/icons-webfont/dist/tabler-icons.min.css';

// 引入Fabric.js
import * as fabric from 'fabric';

// 设置全局fabric
window.fabric = fabric;

import { ScreenshotAPI } from './api/screenshot-api.js';
import { SelectionManager } from './managers/selection-manager.js';
import { ToolbarManager } from './managers/toolbar-manager.js';
import { SubToolbarManager } from './managers/sub-toolbar-manager.js';
import { MaskManager } from './managers/mask-manager.js';
import { EventManager } from './managers/event-manager.js';
import { BackgroundManager } from './managers/background-manager.js';
import { ExportManager } from './managers/export-manager.js';
import { FabricEditLayerManager } from './managers/fabric-edit-layer-manager.js';
import { FabricToolManager } from './managers/fabric-tool-manager.js';
import { MagnifierManager } from './managers/magnifier-manager.js';
import { OCRManager } from './managers/ocr-manager.js';
import { HelpPanelManager } from './managers/help-panel-manager.js';
import { ScrollingScreenshotManager } from './managers/scrolling-screenshot-manager.js';
import { autoSelectionManager } from './managers/auto-selection-manager.js';
import { TooltipManager } from './managers/tooltip-manager.js';
import { registerArrowClass } from './tools/fabric-simple-arrow-tool.js';

export class ScreenshotController {
    constructor() {
        this.monitors = [];
        
        // 设置变量（默认值）
        this.magnifierEnabled = true;
        this.hintsEnabled = true;
        
        // 待加载的截屏数据
        this.pendingScreenshotData = null;

        if (typeof fabric === 'undefined') {
            setTimeout(() => this.initializeManagers(), 100);
            return;
        }
        
        this.initializeController();
        registerArrowClass();
    }
    
    async initializeController() {
        // 加载设置
        await this.loadSettings();
        
        // 初始化各个管理器
        this.selectionManager = new SelectionManager();
        this.toolbarManager = new ToolbarManager();
        this.subToolbarManager = new SubToolbarManager();
        this.maskManager = new MaskManager();
        this.eventManager = new EventManager();
        this.backgroundManager = new BackgroundManager();
        this.exportManager = new ExportManager();
        this.editLayerManager = new FabricEditLayerManager();
        this.toolManager = new FabricToolManager();
        this.magnifierManager = new MagnifierManager();
        this.ocrManager = new OCRManager();
        this.helpPanelManager = new HelpPanelManager();
        this.scrollingScreenshotManager = new ScrollingScreenshotManager();
        this.tooltipManager = new TooltipManager();
        
        
        // 设置管理器之间的引用关系
        this.exportManager.setBackgroundManager(this.backgroundManager);
        this.exportManager.setEditLayerManager(this.editLayerManager);
        this.editLayerManager.setBackgroundManager(this.backgroundManager);
        this.toolManager.setEditLayerManager(this.editLayerManager);
        
        // 应用设置到放大镜管理器
        this.magnifierManager.setColorIncludeFormat(this.colorIncludeFormat);
        
        // 设置放大镜复制颜色后的回调
        this.magnifierManager.setOnColorCopied(() => {
            this.cancelScreenshot();
        });
        
        // 设置子工具栏参数变化回调
        this.subToolbarManager.onParameterChange((toolName, paramName, value) => {
            this.handleParameterChange(toolName, paramName, value);
        });
        
        this.initializeManagers();
        this.loadMonitorInfo();

        this.tooltipManager.init();
        
        // 设置全局引用，供工具使用
        window.screenshotController = this;
        window.screenshotApp = this;
        
    }

    /**
     * 初始化各管理器的事件绑定
     */
    initializeManagers() {
        // 事件管理器回调
        this.eventManager.setOnSelectionStart((x, y, target) => this.handleSelectionStart(x, y, target));
        this.eventManager.setOnSelectionUpdate((x, y, shiftKey) => this.handleSelectionUpdate(x, y, shiftKey));
        this.eventManager.setOnSelectionEnd(() => this.handleSelectionEnd());
        this.eventManager.setOnRightClick((x, y) => this.handleRightClick(x, y));
        this.eventManager.setOnKeyDown((key) => this.handleKeyDown(key));
        this.eventManager.setOnWindowFocus(() => this.handleWindowFocus());
        this.eventManager.setOnWindowBlur(() => this.handleWindowBlur());
        
        // 监听后端截屏完成事件
        window.__TAURI__.event.listen('screenshot-ready', async (event) => {
            const payload = event.payload;

            if (!payload || typeof payload !== 'object') {
                console.error('无法解析截屏事件数据', payload);
                return;
            }

            const { width, height, image_url } = payload;
            if (!width || !height || !image_url) {
                console.error('截屏事件缺少字段', payload);
                return;
            }

            // 保存截屏数据并重新初始化
            this.pendingScreenshotData = { width, height, image_url };
            await this.reinitialize();
        });

        // 监听后端截屏错误事件
        window.__TAURI__.event.listen('screenshot-error', (event) => {
            console.error('后端截屏失败:', event.payload);
        });

        // 页面加载完成时初始化背景管理器
        if (document.readyState === 'complete') {
            this.backgroundManager.init();
        } else {
            window.addEventListener('load', () => {
                this.backgroundManager.init();
            });
        }

        // 工具栏管理器回调
        this.toolbarManager.setOnConfirm(() => this.confirmScreenshot());
        this.toolbarManager.setOnCancel(() => this.cancelScreenshot());
        this.toolbarManager.setOnToolSelect((toolName) => this.handleToolSelect(toolName));
        this.toolbarManager.setOnUndo(() => this.handleUndo());
        this.toolbarManager.setOnRedo(() => this.handleRedo());
        
        // 编辑层历史状态回调
        this.editLayerManager.setOnHistoryChange((historyState) => {
            this.toolbarManager.updateHistoryButtons(historyState.canUndo, historyState.canRedo);
        });
        
        // 编辑层活动对象变化回调
        this.editLayerManager.setOnActiveObjectChange((objectInfo) => {
            this.handleActiveObjectChange(objectInfo);
        });
    }

    /**
     * 处理选择开始
     */
    handleSelectionStart(x, y, target) {
        // target 为 null 表示点击（确认自动选区）
        if (target === null && autoSelectionManager.isActive) {
            const bounds = autoSelectionManager.confirmSelection();
            
            if (bounds) {
                // 禁用遮罩层过渡
                this.maskManager.disableTransition();
                
                // 创建正常选区
                this.selectionManager.setSelection(
                    bounds.x,
                    bounds.y,
                    bounds.width,
                    bounds.height
                );
                
                // 更新遮罩
                this.maskManager.updateMask(
                    bounds.x,
                    bounds.y,
                    bounds.width,
                    bounds.height,
                    this.selectionManager.borderRadius
                );
                
                // 隐藏放大镜
                if (this.magnifierManager) {
                    this.magnifierManager.hide();
                }
                
                // 显示工具栏
                this.toolbarManager.show(this.selectionManager.selectionRect);

                if (this.tooltipManager) {
                    requestAnimationFrame(() => {
                        this.tooltipManager.updateAllTooltips();
                    });
                }
            }
            return;
        }
        
        // target 不为 null 表示拖拽或点击操作节点
        // 如果自动选区激活，先停止它
        if (autoSelectionManager.isActive) {
            autoSelectionManager.stop();
        }
        
        const action = this.selectionManager.startSelection(x, y, target);
        
        if (action === 'select') {
            this.hideAllToolbars();
            // 开始新的选择时，显示放大镜
            if (this.magnifierManager && this.magnifierEnabled) {
                this.magnifierManager.show();
            }
        } else if (action === 'move') {
            this.hideAllToolbars();
        } else if (action === 'resize') {
            this.hideAllToolbars();
        }
    }

    /**
     * 处理选择更新
     */
    handleSelectionUpdate(x, y, shiftKey) {
        // 始终更新放大镜位置
        if (this.magnifierManager) {
            this.magnifierManager.update(x, y);
        }
        
        if (this.selectionManager.isSelectingState) {
            this.selectionManager.updateSelection(x, y);
            const selection = this.selectionManager.getSelection();
            if (selection) {
                const borderRadius = this.selectionManager.getBorderRadius();
                this.maskManager.updateMask(selection.left, selection.top, selection.width, selection.height, borderRadius);
            }
            this.hideAllToolbars();
        } else if (this.selectionManager.isMovingState) {
            this.selectionManager.moveSelection(x, y, this.maskManager);
            this.hideAllToolbars();
        } else if (this.selectionManager.isResizingState) {
            this.selectionManager.resizeSelection(x, y, this.maskManager, shiftKey);
            this.hideAllToolbars();
        } else if (this.selectionManager.isAdjustingRadius) {
            this.selectionManager.adjustRadius(x, y, this.maskManager);
            this.hideAllToolbars();
        }
    }

    /**
     * 处理选择结束
     */
    handleSelectionEnd() {
        const action = this.selectionManager.endSelection();
        
        if (action === 'move-end' || action === 'select-end' || action === 'resize-end' || action === 'radius-end') {
            const selection = this.selectionManager.getSelection();
            if (selection) {
                // 更新遮罩层
                const borderRadius = this.selectionManager.getBorderRadius();
                this.maskManager.updateMask(selection.left, selection.top, selection.width, selection.height, borderRadius);

                const mainToolbarPosition = this.toolbarManager.show(selection);
                
                // 有选区时隐藏放大镜
                if (this.magnifierManager) {
                    this.magnifierManager.hide();
                }

                if (this.tooltipManager) {
                    requestAnimationFrame(() => {
                        this.tooltipManager.updateAllTooltips();
                    });
                }
                
                // 如果有激活的工具，显示对应的子工具栏
                const currentTool = this.toolbarManager.getCurrentTool();
                if (currentTool && mainToolbarPosition) {
                    this.showSubToolbarForTool(currentTool, selection, mainToolbarPosition);
                }
            } else {
                // 没有选区时，禁用所有编辑工具
                this.disableAllTools();
            }
        }
    }

    /**
     * 隐藏所有工具栏
     */
    hideAllToolbars() {
        this.toolbarManager.hide();
        this.subToolbarManager.hide();
    }

    /**
     * 禁用所有编辑工具
     */
    disableAllTools() {
        // 停用当前激活的工具
        if (this.toolManager) {
            this.toolManager.deactivateTool();
        }
        
        // 清除工具栏选中状态
        if (this.toolbarManager) {
            this.toolbarManager.setActiveTool(null);
        }
        
        // 隐藏所有工具栏
        this.hideAllToolbars();
    }

    /**
     * 处理右键点击
     */
    async handleRightClick(x, y) {
        // 长截屏激活时，右键不清除选区
        if (this.scrollingScreenshotManager.isActive) {
            return;
        }
        
        const selection = this.selectionManager.getSelection();
        
        if (selection) {
            // 有选区时：取消选区，回到初始状态
            await this.clearSelection();
        } else {
            // 没有选区时：关闭截屏窗口
            this.cancelScreenshot();
        }
    }

    /**
     * 处理活动对象变化
     */
    handleActiveObjectChange(objectInfo) {
        const { activeObject, objects, type } = objectInfo;
        
        if (!activeObject || !type) {
            // 没有选中对象，隐藏子工具栏
            this.subToolbarManager.hide();
            return;
        }
        
        // 映射对象类型到工具名称，然后显示子工具栏
        const toolName = this.mapObjectTypeToToolName(type);
        if (toolName) {
            const selectionRect = this.getActiveObjectBounds(activeObject);
            this.showSubToolbarForTool(toolName, selectionRect);
        } else {
            this.subToolbarManager.hide();
        }
    }

    /**
     * 映射对象类型到工具名称
     */
    mapObjectTypeToToolName(objectType) {
        switch (objectType) {
            case 'brush':
                return 'brush';
            case 'text':
                return 'text';
            case 'arrow':
                return 'arrow';
            case 'mosaic':
            case 'mosaic-path':
                return null;
            case 'rectangle':
            case 'circle':
            case 'ellipse':           // 椭圆
            case 'triangle':          // 三角形
            case 'diamond':           // 菱形
            case '5-gon':             // 五边形
            case '6-gon':             // 六边形
            case 'star':              // 星形
            case 'shape-arrow':       // 形状工具中的箭头形状
                return 'shape';
            case 'selection':
            default:
                return null; // 多选或未知类型
        }
    }

    /**
     * 获取活动对象的边界
     */
    getActiveObjectBounds(activeObject) {
        if (!activeObject) return null;
        
        try {
            const bounds = activeObject.getBoundingRect();
            return {
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height
            };
        } catch (error) {
            console.warn('获取对象边界失败:', error);
            return null;
        }
    }

    /**
     * 处理键盘事件
     */
    handleKeyDown(key) {
        if (key === 'escape') {
            this.cancelScreenshot();
        } else if (key === 'enter') {
            const selection = this.selectionManager.getSelection();
            if (selection) {
                this.confirmScreenshot();
            }
        } else if (key === 'ctrl+z') {
            // Ctrl+Z 撤销 - 但要检查是否正在编辑文本
            if (this.canUseKeyboardShortcuts()) {
                this.handleUndo();
            }
        } else if (key === 'ctrl+y' || key === 'ctrl+shift+z') {
            // Ctrl+Y 或 Ctrl+Shift+Z 重做 - 但要检查是否正在编辑文本
            if (this.canUseKeyboardShortcuts()) {
                this.handleRedo();
            }
        }
    }

    /**
     * 处理窗口获得焦点
     */
    handleWindowFocus() {
        // 长截屏工具激活，不要重置UI
        if (this.scrollingScreenshotManager && this.scrollingScreenshotManager.isActive) {
            return;
        }
        this.reset();
    }

    /**
     * 处理窗口失去焦点
     */
    handleWindowBlur() {
        // 长截屏工具激活，不要重置UI
        if (this.scrollingScreenshotManager && this.scrollingScreenshotManager.isActive) {
            return;
        }
        this.reset();
    }

    /**
     * 加载设置
     */
    async loadSettings() {
        try {
            const settings = await ScreenshotAPI.getSettings();
            this.magnifierEnabled = settings.screenshot_magnifier_enabled !== false;
            this.hintsEnabled = settings.screenshot_hints_enabled !== false;
            this.colorIncludeFormat = settings.screenshot_color_include_format !== false;
        } catch (error) {
            console.error('加载设置失败:', error);
            this.magnifierEnabled = true;
            this.hintsEnabled = true;
            this.colorIncludeFormat = true;
        }
    }
    
    /**
     * 重新初始化（每次截屏时调用）
     */
    async reinitialize() {
        try {
            // 重新加载设置
            await this.loadSettings();
            
            // 应用设置到放大镜管理器
            if (this.magnifierManager) {
                this.magnifierManager.setColorIncludeFormat(this.colorIncludeFormat);
            }
            
            // 初始化背景
            if (!this.backgroundManager.canvas) {
                this.backgroundManager.init();
            }
            
            // 加载截屏图片
            if (this.pendingScreenshotData) {
                await this.backgroundManager.loadScreenshot(this.pendingScreenshotData);
            }
            
            // 初始化编辑层
            this.editLayerManager.init();
            
            // 根据配置显示放大镜
            if (this.backgroundManager.canvas) {
                this.magnifierManager.setBackgroundCanvas(this.backgroundManager.canvas);
                if (this.magnifierEnabled) {
                    this.magnifierManager.show();
                }
            }
            
            // 根据配置显示帮助面板
            if (this.hintsEnabled) {
                this.helpPanelManager.show();
            }
            
            // 启动自动选区
            await autoSelectionManager.start();
            
        } catch (error) {
            console.error('重新初始化失败:', error);
        }
    }

    /**
     * 加载显示器信息
     */
    async loadMonitorInfo() {
        try {
            this.monitors = await ScreenshotAPI.getMonitors();
            
            // 计算虚拟屏幕边界
            const virtualBounds = this.calculateVirtualBounds(this.monitors);
            
            // 将边界信息传递给选区管理器
            this.selectionManager.setMonitorBounds(this.monitors, virtualBounds);
            
            // 将显示器信息传递给帮助面板管理器
            this.helpPanelManager.setMonitors(this.monitors);
        } catch (error) {
            console.error('Failed to load monitor info:', error);
            this.monitors = [];
        }
    }
    
    /**
     * 计算虚拟屏幕边界
     */
    calculateVirtualBounds(monitors) {
        if (!monitors || monitors.length === 0) {
            return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
        }
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        monitors.forEach(monitor => {
            minX = Math.min(minX, monitor.x);
            minY = Math.min(minY, monitor.y);
            maxX = Math.max(maxX, monitor.x + monitor.width);
            maxY = Math.max(maxY, monitor.y + monitor.height);
        });
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }


    /**
     * 处理工具选择
     */
    handleToolSelect(toolName) {
        if (toolName === 'ocr') {
            // OCR工具特殊处理：显示子工具栏，不激活编辑工具
            this.toolbarManager.setActiveTool('ocr');
            this.showSubToolbarForTool('ocr');
            return;
        }
        
        if (toolName === 'scrolling') {
            // 长截屏工具特殊处理
            this.handleScrollingScreenshot();
            return;
        }
        
        if (toolName === 'pin-image') {
            // 贴图工具特殊处理
            this.handlePinImage();
            return;
        }
        
        if (toolName) {
            // 激活工具
            this.toolManager.activateTool(toolName);
            // 更新工具栏按钮状态
            this.toolbarManager.setActiveTool(toolName);
            // 显示工具参数栏
            this.showSubToolbarForTool(toolName);
            
            // 画笔工具设置自定义光标
            if (toolName === 'brush') {
                this.editLayerManager.updateBrushCursor();
            }
        } else {
            // 取消激活工具
            this.toolManager.deactivateTool();
            // 清除工具栏按钮状态
            this.toolbarManager.setActiveTool(null);
            // 隐藏参数栏
            this.subToolbarManager.hide();
        }
    }
    
    /**
     * 处理OCR工具
     */
    async handleOCRTool() {
        const selection = this.selectionManager.getSelection();
        if (!selection) {
            console.warn('请先选择要识别的区域');
            return;
        }
        
        try {
            // 显示加载提示
            this.ocrManager.showLoadingDialog();
            
            // 执行OCR识别（带位置信息）
            const result = await this.ocrManager.recognizeSelection(
                this.backgroundManager.canvas,
                selection
            );
            
            // 隐藏加载提示
            this.ocrManager.hideLoadingDialog();
            
            // 在原图上显示覆盖层
            this.ocrManager.showOverlayResult(result);
        } catch (error) {
            console.error('OCR识别失败:', error);
            this.ocrManager.hideLoadingDialog();
        }
    }

    /**
     * 处理OCR复制操作
     */
    async handleOCRCopy() {
        if (this.ocrManager && this.ocrManager.copyText) {
            await this.ocrManager.copyText();
        }
    }

    /**
     * 处理OCR关闭操作
     */
    handleOCRClose() {
        if (this.ocrManager && this.ocrManager.clear) {
            this.ocrManager.clear();
        }
    }

    /**
     * 处理贴图工具
     */
    async handlePinImage() {
        const selection = this.selectionManager.getSelection();
        if (!selection) return;
        
        try {
            this.hideAllToolbars();
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const borderRadius = this.selectionManager.getBorderRadius();
            const blob = await this.exportManager.exportSelectionAsBlob(selection, borderRadius);
            if (!blob) return;
            
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            await window.__TAURI__.core.invoke('create_pin_image_window', {
                imageData: Array.from(uint8Array),
                width: Math.round(selection.width),
                height: Math.round(selection.height),
                x: Math.round(selection.left),
                y: Math.round(selection.top)
            });
            
            this.clearAllContent();
            await ScreenshotAPI.hideWindow();
        } catch (error) {
            console.error('创建贴图窗口失败:', error);
        }
    }

    /**
     * 处理长截屏工具
     */
    async handleScrollingScreenshot() {
        const selection = this.selectionManager.getSelection();
        if (!selection) {
            return;
        }
        
        try {
            // 隐藏工具栏
            this.hideAllToolbars();
            
            this.scrollingScreenshotManager.setOnCancel(() => {;
                const mainToolbarPosition = this.toolbarManager.show(selection);

                if (this.tooltipManager) {
                    requestAnimationFrame(() => {
                        this.tooltipManager.updateAllTooltips();
                    });
                }
                
                // 取消工具激活状态
                this.toolbarManager.setActiveTool(null);
            });
            
            // 设置完成回调
            this.scrollingScreenshotManager.setOnComplete(async () => {
                //直接关闭截屏窗口
                try {
                    this.toolbarManager.setActiveTool(null);
                    
                    this.clearAllContent();
                    await ScreenshotAPI.hideWindow();
                } catch (error) {
                    console.error('完成长截屏失败:', error);
                }
            });
            
            // 激活长截屏
            await this.scrollingScreenshotManager.activate(selection);
        } catch (error) {
            console.error('启动长截屏失败:', error);
        }
    }

    /**
     * 为指定工具显示子工具栏
     */
    showSubToolbarForTool(toolName, selectionRect = null, mainToolbarPosition = null) {
        // 如果没有提供选区信息，从选择管理器获取
        const selection = selectionRect || this.selectionManager.getSelection();
        
        if (selection && this.toolbarManager.isVisible()) {
            // 如果没有提供主工具栏位置
            if (!mainToolbarPosition) {
                const mainToolbarRect = this.toolbarManager.toolbar.getBoundingClientRect();
                mainToolbarPosition = {
                    left: mainToolbarRect.left,
                    top: mainToolbarRect.top,
                    width: mainToolbarRect.width,
                    height: mainToolbarRect.height
                };
            }
            
            this.subToolbarManager.showForTool(toolName, mainToolbarPosition, selection);

            if (this.tooltipManager) {
                requestAnimationFrame(() => {
                    this.tooltipManager.updateAllTooltips();
                });
            }
        }
    }

    /**
     * 处理参数变化
     */
    handleParameterChange(toolName, paramName, value) {
        // 处理 OCR 工具的操作按钮
        if (toolName === 'ocr' && value === 'action') {
            switch (paramName) {
                case 'recognize':
                    this.handleOCRTool();
                    break;
                case 'copy':
                    this.handleOCRCopy();
                    break;
                case 'close':
                    this.handleOCRClose();
                    break;
            }
            return;
        }
        
        // 优先根据工具名称找到对应的工具来处理参数变化
        const targetTool = this.toolManager.getTool(toolName);
        if (targetTool && targetTool.applyParameter) {
            targetTool.applyParameter(paramName, value);
        }
        
        // 如果没找到对应工具，尝试应用到当前工具
        if (!targetTool) {
            const currentTool = this.toolManager.getCurrentTool();
            if (currentTool && currentTool.applyParameter) {
                currentTool.applyParameter(paramName, value);
            }
        }
        
        // 如果是画笔工具的参数变化，更新光标
        if (toolName === 'brush' && (paramName === 'brushSize' || paramName === 'color' || paramName === 'opacity')) {
            this.editLayerManager.updateBrushCursor();
        }
    }

    /**
     * 处理撤销操作
     */
    async handleUndo() {
        try {
            await this.editLayerManager.undo();
        } catch (error) {
            console.error('撤销操作失败:', error);
        }
    }

    /**
     * 处理重做操作
     */
    async handleRedo() {
        try {
            await this.editLayerManager.redo();
        } catch (error) {
            console.error('重做操作失败:', error);
        }
    }

    /**
     * 检查是否可以使用键盘快捷键
     */
    canUseKeyboardShortcuts() {
        // 使用工具管理器的方法检查
        if (this.toolManager && this.toolManager.canUseKeyboardShortcuts) {
            return this.toolManager.canUseKeyboardShortcuts();
        }

        if (this.editLayerManager && this.editLayerManager.getFabricCanvas) {
            const canvas = this.editLayerManager.getFabricCanvas();
            if (canvas) {
                const activeObject = canvas.getActiveObject();
                if (activeObject && activeObject.type === 'text' && activeObject.isEditing) {
                    return false;
                }
            }
        }
        
        return true;
    }

    /**
     * 确认截屏
     */
    async confirmScreenshot() {
        const selection = this.selectionManager.getSelection();
        if (!selection) return;
        
        try {
            this.hideAllToolbars();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 获取圆角半径
            const borderRadius = this.selectionManager.getBorderRadius();
            
            // 使用导出管理器复制选区到剪贴板（自动合并编辑层）
            await this.exportManager.copySelectionToClipboard(selection, borderRadius);
            
            // 清理内容并关闭窗口
            this.clearAllContent();
            await ScreenshotAPI.hideWindow();
        } catch (error) {
            console.error('截屏失败:', error);
        }
    }

    /**
     * 取消截屏
     */
    async cancelScreenshot() {
        try {
            // 停止自动选区
            if (autoSelectionManager.isActive) {
                await autoSelectionManager.stop();
            }

            // 清理工具栏状态
            this.toolbarManager.setActiveTool(null);
            
            // 清理内容并隐藏窗口
            this.clearAllContent();
            await ScreenshotAPI.hideWindow();
        } catch (error) {
            console.error('隐藏窗口失败:', error);
        }
    }


    /**
     * 清除选区
     */
    async clearSelection() {
        this.selectionManager.clearSelection();
        this.disableAllTools(); // 清除选区时禁用所有工具
        this.maskManager.resetToFullscreen();
        
        // 清除选区后根据配置显示放大镜
        if (this.magnifierManager && this.magnifierEnabled && this.backgroundManager?.isScreenshotLoaded) {
            this.magnifierManager.show();
        }
        
        // 重新启动自动选区
        if (autoSelectionManager && !autoSelectionManager.isActive) {
            try {
                await autoSelectionManager.start();
            } catch (error) {
                console.error('重新启动自动选区失败:', error);
            }
        }
    }

    /**
     * 彻底清空所有内容（用于窗口隐藏时，防止下次显示旧内容）
     */
    clearAllContent() {
        try {
            // 清空编辑层（包括画布内容和历史记录）
            if (this.editLayerManager) {
                this.editLayerManager.clear();
                this.editLayerManager.clearHistory();
            }
            
            // 清空背景管理器
            if (this.backgroundManager?.clearBackground) {
                this.backgroundManager.clearBackground();
            }
            
            // 重置选区管理器
            if (this.selectionManager?.reset) {
                this.selectionManager.reset();
            }
            
            // 清空遮罩管理器
            if (this.maskManager?.clear) {
                this.maskManager.clear();
            }
            
            // 隐藏放大镜
            if (this.magnifierManager?.clear) {
                this.magnifierManager.clear();
            }
            
            // 隐藏帮助面板
            if (this.helpPanelManager?.hide) {
                this.helpPanelManager.hide();
            }
            
            // 清理 OCR 界面元素
            if (this.ocrManager?.clear) {
                this.ocrManager.clear();
            }
            
            // 清理长截屏界面元素
            if (this.scrollingScreenshotManager?.clear) {
                this.scrollingScreenshotManager.clear();
            }
            
            // 禁用所有编辑工具
            this.disableAllTools();
            
            // 重置工具管理器（清空工具状态）
            if (this.toolManager?.clear) {
                this.toolManager.clear();
            }
            
            // 重置历史按钮状态
            if (this.toolbarManager?.resetHistoryButtons) {
                this.toolbarManager.resetHistoryButtons();
            }
            
            // 重新初始化工具参数为默认值
            if (this.subToolbarManager?.initParameters) {
                this.subToolbarManager.initParameters();
            }
            
            // 恢复默认光标
            this.editLayerManager.restoreCursor();
            
        } catch (error) {
            console.error('清空内容时出错:', error);
        }
    }

    /**
     * 重置状态
     */
    reset() {
        this.selectionManager.reset();
        this.disableAllTools(); // 重置状态时禁用所有工具
        this.maskManager.clear();
        this.editLayerManager.restoreCursor(); // 恢复默认光标
    }

}

// 初始化
let screenshotController = null;

document.addEventListener('DOMContentLoaded', () => {
    screenshotController = new ScreenshotController();
});
