/**
 * 贴图窗口
 */

import { Menu, CheckMenuItem, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

// 创建右键菜单
async function createContextMenu(window, shadowState) {
    document.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        
        // 获取当前置顶状态
        const isOnTop = await window.isAlwaysOnTop();
        
        // 创建勾选菜单项
        const alwaysOnTopItem = await CheckMenuItem.new({
            id: 'toggle-top',
            text: '窗口置顶',
            checked: isOnTop,
            action: async () => {
                try {
                    await window.setAlwaysOnTop(!isOnTop);
                } catch (error) {
                    console.error('切换置顶失败:', error);
                }
            }
        });
        
        const shadowItem = await CheckMenuItem.new({
            id: 'toggle-shadow',
            text: '窗口阴影',
            checked: shadowState.enabled,
            action: async () => {
                try {
                    shadowState.enabled = !shadowState.enabled;
                    await window.setShadow(shadowState.enabled);
                } catch (error) {
                    console.error('切换阴影失败:', error);
                }
            }
        });
        
        const separator1 = await PredefinedMenuItem.new({
            item: 'Separator'
        });
        
        const copyItem = await MenuItem.new({
            id: 'copy',
            text: '复制到剪贴板',
            action: async () => {
                try {
                    await invoke('copy_pin_image_to_clipboard');
                } catch (error) {
                    console.error('复制到剪贴板失败:', error);
                }
            }
        });
        
        const saveAsItem = await MenuItem.new({
            id: 'save-as',
            text: '图像另存为...',
            action: async () => {
                try {
                    await invoke('save_pin_image_as');
                } catch (error) {
                    console.error('保存图片失败:', error);
                }
            }
        });
        
        const separator2 = await PredefinedMenuItem.new({
            item: 'Separator'
        });
        
        const closeItem = await MenuItem.new({
            id: 'close',
            text: '关闭窗口',
            action: async () => {
                try {
                    await invoke('close_pin_image_window_by_self');
                } catch (error) {
                    console.error('关闭窗口失败:', error);
                }
            }
        });
        
        // 创建菜单
        const menu = await Menu.new({
            items: [alwaysOnTopItem, shadowItem, separator1, copyItem, saveAsItem, separator2, closeItem]
        });
        
        await menu.popup();
    });
}

(async () => {
    const img = document.getElementById('pinImage');
    const sizeIndicator = document.getElementById('sizeIndicator');
    const currentWindow = getCurrentWindow();
    
    let mouseDown = false;
    let hasMoved = false;
    let sizeIndicatorTimer = null;
    let initialSize = null;
    let scaleLevel = 10;
    
    // 图片缩放和位置
    let imageScale = 1; // 图片缩放比例，1 = 100%
    let imageX = 0; // 图片X偏移
    let imageY = 0; // 图片Y偏移
    let isDraggingImage = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartImageX = 0;
    let dragStartImageY = 0;
    
    const shadowState = { enabled: false };
    
    // 应用图片变换
    function applyImageTransform() {
        img.style.transform = `translate(${imageX}px, ${imageY}px) scale(${imageScale})`;
        img.style.transformOrigin = 'center center';
    }
    
    // 限制图片位置在窗口边界内
    function constrainImagePosition() {
        if (imageScale <= 1) {
            imageX = 0;
            imageY = 0;
            return;
        }
        
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;
        const maxOffsetX = Math.max(0, (containerWidth * imageScale - containerWidth) / 2);
        const maxOffsetY = Math.max(0, (containerHeight * imageScale - containerHeight) / 2);
        
        imageX = Math.max(-maxOffsetX, Math.min(maxOffsetX, imageX));
        imageY = Math.max(-maxOffsetY, Math.min(maxOffsetY, imageY));
    }
    
    // 显示大小指示器
    function showSizeIndicator(width, height, level, isImageScale = false) {
        if (isImageScale) {
            // 图片缩放模式：只显示缩放比例
            sizeIndicator.textContent = `图片 ${level}%`;
        } else {
            // 窗口缩放模式：显示窗口大小和百分比
            const scalePercent = level * 10;
            sizeIndicator.textContent = `${Math.round(width)} × ${Math.round(height)} (${scalePercent}%)`;
        }
        sizeIndicator.classList.add('show');
        
        if (sizeIndicatorTimer) {
            clearTimeout(sizeIndicatorTimer);
        }
        
        sizeIndicatorTimer = setTimeout(() => {
            sizeIndicator.classList.remove('show');
        }, 2000);
    }
    
    // 鼠标滚轮缩放
    document.addEventListener('wheel', async (e) => {
        e.preventDefault();
        
        try {
            if (e.altKey) {
                // Alt + 滚轮：缩放图片内容
                const delta = e.deltaY < 0 ? 0.1 : -0.1;
                const oldScale = imageScale;
                imageScale = Math.max(1, imageScale + delta);
                
                if (imageScale > 1) {
                    // 以鼠标位置为中心缩放
                    // 获取鼠标相对于窗口中心的位置
                    const windowCenterX = window.innerWidth / 2;
                    const windowCenterY = window.innerHeight / 2;
                    const mouseX = e.clientX - windowCenterX;
                    const mouseY = e.clientY - windowCenterY;
                    
                    // 计算鼠标在缩放前图片坐标系中的位置
                    const pointX = (mouseX - imageX) / oldScale;
                    const pointY = (mouseY - imageY) / oldScale;
                    
                    imageX = mouseX - pointX * imageScale;
                    imageY = mouseY - pointY * imageScale;
                    
                    constrainImagePosition();
                } else {
                    imageX = 0;
                    imageY = 0;
                }
                
                applyImageTransform();
                showSizeIndicator(0, 0, Math.round(imageScale * 100), true);
            } else {
                // 普通滚轮：缩放窗口
                if (!initialSize) {
                    const currentSize = await currentWindow.innerSize();
                    const scaleFactor = await currentWindow.scaleFactor();
                    initialSize = {
                        width: currentSize.width / scaleFactor,
                        height: currentSize.height / scaleFactor
                    };
                }
                
                if (e.deltaY < 0) {
                    scaleLevel++;
                } else {
                    scaleLevel = Math.max(1, scaleLevel - 1);
                }
                
                // 基于初始大小和缩放级别计算新尺寸
                const newWidth = initialSize.width * (scaleLevel / 10);
                const newHeight = initialSize.height * (scaleLevel / 10);
                
                await currentWindow.setSize(new LogicalSize(newWidth, newHeight));
                showSizeIndicator(newWidth, newHeight, scaleLevel);
                
                // 窗口大小变化后，重置图片缩放状态
                if (imageScale > 1) {
                    imageScale = 1;
                    imageX = 0;
                    imageY = 0;
                    applyImageTransform();
                }
            }
        } catch (error) {
            console.error('缩放失败:', error);
        }
    }, { passive: false });
    
    img.addEventListener('selectstart', e => e.preventDefault()); // 阻止选中
    img.addEventListener('dragstart', e => e.preventDefault());   // 阻止拖拽
    
    // 阻止 Alt 键默认行为
    document.addEventListener('keydown', (e) => {
        if (e.altKey) {
            e.preventDefault();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
            e.preventDefault();
        }
    });
    
    // 创建右键菜单
    await createContextMenu(currentWindow, shadowState);
    
    // 按下鼠标
    img.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        if (e.button === 0) {
            if (e.altKey && imageScale > 1) {
                // Alt + 左键：拖动图片
                isDraggingImage = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                dragStartImageX = imageX;
                dragStartImageY = imageY;
            } else {
                // 普通左键：拖动窗口
                mouseDown = true;
                hasMoved = false;
            }
        }
    });
    
    // 鼠标移动
    img.addEventListener('mousemove', (e) => {
        if (isDraggingImage) {
            // 拖动图片
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            imageX = dragStartImageX + deltaX;
            imageY = dragStartImageY + deltaY;
            constrainImagePosition();
            applyImageTransform();
        } else if (mouseDown && !hasMoved) {
            // 拖动窗口
            hasMoved = true;
            currentWindow.startDragging();
        }
    });
    
    // 鼠标释放
    img.addEventListener('mouseup', () => {
        mouseDown = false;
        isDraggingImage = false;
    });
    
    // 双击关闭窗口
    img.addEventListener('dblclick', async (e) => {
        e.preventDefault(); // 阻止默认行为
        try {
            await invoke('close_pin_image_window_by_self');
        } catch (error) {
            console.error('关闭窗口失败:', error);
        }
    });
    
    try {
        // 请求图片数据
        const data = await invoke('get_pin_image_data');
        
        if (data && data.file_path) {
            // 转换为 asset 协议 URL
            const assetUrl = convertFileSrc(data.file_path, 'asset');
            img.src = assetUrl;
        }
    } catch (error) {
        console.error('加载图片失败:', error);
    }
})();
