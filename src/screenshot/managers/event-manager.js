/**
 * 事件管理模块
 * 负责键盘和鼠标事件的处理和分发
 */

export class EventManager {
    constructor() {
        this.overlay = document.getElementById('overlay');
        this.selectionArea = document.getElementById('selectionArea');
        
        this.onSelectionStart = null;
        this.onSelectionUpdate = null;
        this.onSelectionEnd = null;
        this.onRightClick = null;
        this.onKeyDown = null;
        this.onWindowFocus = null;
        this.onWindowBlur = null;
        
        // 拖拽检测
        this.mouseDownPos = null;
        this.isDragging = false;
        this.dragThreshold = 5; // 5像素移动阈值
        
        // 选区操作状态
        this.isSelectionOperation = false;
        
        this.initEvents();
    }

    initEvents() {
        // 鼠标事件
        this.overlay.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.selectionArea.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // 右键事件
        document.addEventListener('contextmenu', (e) => this.handleRightClick(e));
        
        // 窗口焦点事件
        window.addEventListener('focus', () => this.onWindowFocus?.());
        window.addEventListener('blur', () => this.onWindowBlur?.());
    }

    handleMouseDown(e) {
        if (e.button !== 0) return; // 只处理左键
        
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // 检查是否点击了选区信息框或其子元素（包括比例按钮）
        const selectionInfo = document.getElementById('selectionInfo');
        if (selectionInfo && (e.target === selectionInfo || selectionInfo.contains(e.target))) {
            // 点击选区信息框内的元素，不触发选区事件
            return;
        }
        
        // 如果点击的是操作节点或选区内部，立即触发选区事件（移动/调整）
        if (e.target.classList.contains('resize-handle') || 
            e.target.classList.contains('radius-handle') ||
            e.target === this.selectionArea) {
            e.preventDefault();
            this.isSelectionOperation = true;
            this.isDragging = false;
            this.mouseDownPos = null;
            this.onSelectionStart?.(mouseX, mouseY, e.target);
            return;
        }
        
        // 在空白处按下：记录位置，等待判断是点击还是拖拽
        e.preventDefault();
        e.stopPropagation();
        this.isSelectionOperation = false;
        this.mouseDownPos = { x: mouseX, y: mouseY, target: e.target };
        this.isDragging = false;
    }

    handleMouseMove(e) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // 如果正在进行选区操作（移动/调整），始终更新
        if (this.isSelectionOperation) {
            this.onSelectionUpdate?.(mouseX, mouseY, e.shiftKey);
            return;
        }
        
        // 空白处：检查是否超过阈值开始拖拽
        if (this.mouseDownPos && !this.isDragging) {
            const dx = Math.abs(mouseX - this.mouseDownPos.x);
            const dy = Math.abs(mouseY - this.mouseDownPos.y);
            
            if (dx > this.dragThreshold || dy > this.dragThreshold) {
                // 超过阈值，开始拖拽（手动选区）
                this.isDragging = true;
                this.isSelectionOperation = true;
                this.onSelectionStart?.(this.mouseDownPos.x, this.mouseDownPos.y, this.mouseDownPos.target);
            }
        }
        
        // 如果已经在拖拽，更新选区
        if (this.isDragging) {
            this.onSelectionUpdate?.(mouseX, mouseY, e.shiftKey);
            return;
        }

        this.onSelectionUpdate?.(mouseX, mouseY, e.shiftKey);
    }

    handleMouseUp(e) {
        if (e.button !== 0) return; // 只处理左键
        
        // 如果记录了 mouseDown 但没有拖拽，说明是点击
        if (this.mouseDownPos && !this.isDragging) {
            // 触发点击事件（确认自动选区）
            this.onSelectionStart?.(e.clientX, e.clientY, null);
        }
        
        // 清除状态
        this.mouseDownPos = null;
        this.isDragging = false;
        this.isSelectionOperation = false;
        
        // 结束选区操作
        this.onSelectionEnd?.();
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.onKeyDown?.('escape');
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this.onKeyDown?.('enter');
        } else if (e.ctrlKey || e.metaKey) {
            // 处理Ctrl/Cmd组合键
            if (e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.onKeyDown?.('ctrl+shift+z'); // 重做
                } else {
                    this.onKeyDown?.('ctrl+z'); // 撤销
                }
            } else if (e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.onKeyDown?.('ctrl+y'); // 重做
            }
        }
    }

    handleRightClick(e) {
        e.preventDefault();
        
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        this.onRightClick?.(mouseX, mouseY);
    }

    /**
     * 设置选择开始回调
     */
    setOnSelectionStart(callback) {
        this.onSelectionStart = callback;
    }

    /**
     * 设置选择更新回调
     */
    setOnSelectionUpdate(callback) {
        this.onSelectionUpdate = callback;
    }

    /**
     * 设置选择结束回调
     */
    setOnSelectionEnd(callback) {
        this.onSelectionEnd = callback;
    }

    /**
     * 设置右键回调
     */
    setOnRightClick(callback) {
        this.onRightClick = callback;
    }

    /**
     * 设置键盘回调
     */
    setOnKeyDown(callback) {
        this.onKeyDown = callback;
    }

    /**
     * 设置窗口焦点回调
     */
    setOnWindowFocus(callback) {
        this.onWindowFocus = callback;
    }

    /**
     * 设置窗口失焦回调
     */
    setOnWindowBlur(callback) {
        this.onWindowBlur = callback;
    }

}
