/**
 * 贴图窗口
 */

import '@tabler/icons-webfont/dist/tabler-icons.min.css';

import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { showContextMenuFromEvent, createMenuItem, createSeparator } from '../plugins/context_menu/index.js';

// 获取当前主题设置
async function getCurrentTheme() {
    try {
        const settings = await invoke('get_settings');
        return settings.theme || 'auto';
    } catch (error) {
        console.error('获取主题设置失败:', error);
        return 'auto';
    }
}

// 保存设置到 localStorage
function saveSettings(settings) {
    try {
        localStorage.setItem('pinImageSettings', JSON.stringify(settings));
    } catch (error) {
        console.error('保存设置失败:', error);
    }
}

// 从 localStorage 加载设置
function loadSettings() {
    try {
        const saved = localStorage.getItem('pinImageSettings');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
    // 返回默认设置
    return {
        alwaysOnTop: false,
        shadow: false,
        lockPosition: false,
        pixelRender: false,
        opacity: 100
    };
}

// 创建右键菜单
async function createContextMenu(window, shadowState, lockPositionState, pixelRenderState) {
    document.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        
        // 获取当前置顶状态
        const isOnTop = await window.isAlwaysOnTop();
        
        // 获取当前透明度
        const img = document.getElementById('pinImage');
        const currentOpacity = img ? Math.round(parseFloat(img.style.opacity || 1) * 100) : 100;
        
        // 创建透明度子菜单项
        const opacityPresets = [100, 90, 80, 70, 60, 50];
        const isCustomOpacity = !opacityPresets.includes(currentOpacity);
        
        const opacityMenuItems = [
            ...opacityPresets.map(opacity => 
                createMenuItem(`opacity-${opacity}`, `${opacity}%`, {
                    icon: currentOpacity === opacity ? 'ti ti-check' : undefined
                })
            ),
            createSeparator(),
            createMenuItem('opacity-custom', '自定义...', {
                icon: isCustomOpacity ? 'ti ti-check' : undefined
            })
        ];
        
        // 构建菜单项数组
        const menuItems = [
            createMenuItem('toggle-top', '窗口置顶', {
                icon: isOnTop ? 'ti ti-check' : 'ti ti-pin'
            }),
            createMenuItem('toggle-shadow', '窗口阴影', {
                icon: shadowState.enabled ? 'ti ti-check' : 'ti ti-shadow'
            }),
            createMenuItem('toggle-lock-position', '锁定位置', {
                icon: lockPositionState.locked ? 'ti ti-check' : 'ti ti-lock'
            }),
            createMenuItem('toggle-pixel-render', '像素级显示', {
                icon: pixelRenderState.enabled ? 'ti ti-check' : 'ti ti-border-all'
            }),
            createMenuItem('opacity-submenu', '透明度', {
                icon: 'ti ti-droplet-half',
                children: opacityMenuItems
            }),
            createSeparator(),
            createMenuItem('copy', '复制到剪贴板', {
                icon: 'ti ti-copy'
            }),
            createMenuItem('save-as', '图像另存为...', {
                icon: 'ti ti-device-floppy'
            }),
            createSeparator(),
            createMenuItem('close', '关闭窗口', {
                icon: 'ti ti-x'
            })
        ];
        
        // 获取当前主题
        const theme = await getCurrentTheme();
        
        // 显示菜单并获取用户选择
        const result = await showContextMenuFromEvent(e, menuItems, {
            theme: theme
        });
        
        // 处理菜单选择
        if (!result) return;
        
        try {
            switch (result) {
                case 'toggle-top':
                    await window.setAlwaysOnTop(!isOnTop);
                    const topSettings = loadSettings();
                    topSettings.alwaysOnTop = !isOnTop;
                    saveSettings(topSettings);
                    break;
                    
                case 'toggle-shadow':
                    shadowState.enabled = !shadowState.enabled;
                    await window.setShadow(shadowState.enabled);
                    const shadowSettings = loadSettings();
                    shadowSettings.shadow = shadowState.enabled;
                    saveSettings(shadowSettings);
                    break;
                    
                case 'toggle-lock-position':
                    lockPositionState.locked = !lockPositionState.locked;
                    const lockSettings = loadSettings();
                    lockSettings.lockPosition = lockPositionState.locked;
                    saveSettings(lockSettings);
                    break;
                    
                case 'toggle-pixel-render':
                    pixelRenderState.enabled = !pixelRenderState.enabled;
                    const img = document.getElementById('pinImage');
                    if (img) {
                        if (pixelRenderState.enabled) {
                            img.style.imageRendering = 'pixelated';
                        } else {
                            img.style.imageRendering = 'auto';
                        }
                    }
                    const pixelSettings = loadSettings();
                    pixelSettings.pixelRender = pixelRenderState.enabled;
                    saveSettings(pixelSettings);
                    break;
                    
                case 'opacity-custom':
                    const input = await invoke('show_input', {
                        title: '自定义透明度',
                        message: '请输入透明度:',
                        placeholder: '0-100',
                        defaultValue: String(currentOpacity),
                        inputType: 'number',
                        minValue: 0,
                        maxValue: 100
                    });
                    
                    if (input !== null) {
                        const img = document.getElementById('pinImage');
                        if (img) {
                            const opacity = parseInt(input);
                            img.style.opacity = opacity / 100;
                            const opacitySettings = loadSettings();
                            opacitySettings.opacity = opacity;
                            saveSettings(opacitySettings);
                        }
                    }
                    break;
                    
                case 'copy':
                    await invoke('copy_pin_image_to_clipboard');
                    break;
                    
                case 'save-as':
                    await invoke('save_pin_image_as');
                    break;
                    
                case 'close':
                    await invoke('close_pin_image_window_by_self');
                    break;
                    
                default:
                    // 处理透明度预设值
                    if (result.startsWith('opacity-')) {
                        const opacity = parseInt(result.substring(8));
                        if (!isNaN(opacity)) {
                            const img = document.getElementById('pinImage');
                            if (img) {
                                img.style.opacity = opacity / 100;
                                const opacitySettings = loadSettings();
                                opacitySettings.opacity = opacity;
                                saveSettings(opacitySettings);
                            }
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('菜单操作失败:', error);
        }
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
    
    // 加载保存的设置
    const savedSettings = loadSettings();
    
    const shadowState = { enabled: savedSettings.shadow };
    const lockPositionState = { locked: savedSettings.lockPosition };
    const pixelRenderState = { enabled: savedSettings.pixelRender };
    
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
    
    // 检查鼠标是否在大小指示器上
    function isMouseOverIndicator(mouseX, mouseY) {
        const rect = sizeIndicator.getBoundingClientRect();
        return mouseX >= rect.left && mouseX <= rect.right && 
               mouseY >= rect.top && mouseY <= rect.bottom;
    }
    
    // 显示大小指示器
    function showSizeIndicator(width, height, level, isImageScale = false, mouseX = 0, mouseY = 0) {
        let mainText = '';
        
        if (isImageScale) {
            // 图片缩放模式：显示缩放比例
            mainText = `图片 ${level}%`;
        } else {
            // 窗口缩放模式：显示窗口大小和百分比
            const scalePercent = level * 10;
            mainText = `${Math.round(width)} × ${Math.round(height)} (${scalePercent}%)`;
        }
        
        const hintText = `
            <span style="font-size: 10px; opacity: 0.8;">
                滚轮: 缩放窗口 | Shift+滚轮: 快速缩放窗口<br>
                Alt+滚轮: 缩放图片 | Shift+Alt+滚轮: 快速缩放图片
            </span>
        `;
        
        sizeIndicator.innerHTML = `${mainText}<br>${hintText}`;
        
        // 检查鼠标是否在提示信息上，如果是则不显示
        if (isMouseOverIndicator(mouseX, mouseY)) {
            sizeIndicator.classList.remove('show');
            if (sizeIndicatorTimer) {
                clearTimeout(sizeIndicatorTimer);
                sizeIndicatorTimer = null;
            }
            return;
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
                // Shift + Alt + 滚轮：更大幅度缩放（步长为0.5）
                // Alt + 滚轮：正常缩放（步长为0.1）
                const step = e.shiftKey ? 0.5 : 0.1;
                const delta = e.deltaY < 0 ? step : -step;
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
                showSizeIndicator(0, 0, Math.round(imageScale * 100), true, e.clientX, e.clientY);
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
                
                // Shift + 滚轮：更大幅度缩放（步长为5）
                // 普通滚轮：正常缩放（步长为1）
                const step = e.shiftKey ? 5 : 1;
                
                if (e.deltaY < 0) {
                    scaleLevel += step;
                } else {
                    scaleLevel = Math.max(1, scaleLevel - step);
                }
                
                // 基于初始大小和缩放级别计算新尺寸
                const newWidth = initialSize.width * (scaleLevel / 10);
                const newHeight = initialSize.height * (scaleLevel / 10);
                
                await currentWindow.setSize(new LogicalSize(newWidth, newHeight));
                showSizeIndicator(newWidth, newHeight, scaleLevel, false, e.clientX, e.clientY);
                
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
    
    // 大小指示器鼠标事件：鼠标悬停时隐藏提示
    sizeIndicator.addEventListener('mouseenter', () => {
        sizeIndicator.classList.remove('show');
        if (sizeIndicatorTimer) {
            clearTimeout(sizeIndicatorTimer);
            sizeIndicatorTimer = null;
        }
    });
    
    // 创建右键菜单
    await createContextMenu(currentWindow, shadowState, lockPositionState, pixelRenderState);
    
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
            } else if (!lockPositionState.locked) {
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
        } else if (mouseDown && !hasMoved && !lockPositionState.locked) {
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
        
        // 应用保存的设置
        // 应用置顶设置
        if (savedSettings.alwaysOnTop) {
            await currentWindow.setAlwaysOnTop(true);
        }
        
        // 应用阴影设置
        if (savedSettings.shadow) {
            await currentWindow.setShadow(true);
        }
        
        // 应用透明度设置
        if (savedSettings.opacity !== 100) {
            img.style.opacity = savedSettings.opacity / 100;
        }
        
        // 应用像素渲染模式
        if (savedSettings.pixelRender) {
            img.style.imageRendering = 'pixelated';
        }
    } catch (error) {
        console.error('加载图片失败:', error);
    }
})();
