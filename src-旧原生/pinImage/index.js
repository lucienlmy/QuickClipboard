/**
 * 贴图窗口主入口
 * 组合所有模块，初始化窗口功能
 */

import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { loadSettings, saveSettings } from './settings.js';
import { createContextMenu } from './contextMenu.js';
import { enterThumbnailMode, exitThumbnailMode } from './thumbnail.js';
import { applyImageTransform } from './imageTransform.js';
import { setupSizeIndicatorEvents } from './sizeIndicator.js';
import {
    setupMouseDown,
    setupMouseMove,
    setupMouseUp,
    setupWheel,
    setupDoubleClick,
    preventDefaults
} from './mouseHandler.js';

(async () => {
    const img = document.getElementById('pinImage');
    const sizeIndicator = document.getElementById('sizeIndicator');
    const currentWindow = getCurrentWindow();
    // 加载保存的设置
    const savedSettings = loadSettings();
    
    // 状态对象
    const states = {
        // 功能状态
        shadow: { enabled: savedSettings.shadow },
        lockPosition: { locked: savedSettings.lockPosition },
        pixelRender: { enabled: savedSettings.pixelRender },
        thumbnail: { enabled: savedSettings.thumbnailMode || false },
        thumbnailRestoreMode: savedSettings.thumbnailRestoreMode || 'follow',
        
        // 鼠标状态
        mouseDown: false,
        hasMoved: false,
        mouseDownX: 0,
        mouseDownY: 0,
        
        // 窗口状态
        initialSize: null,
        originalImageSize: null,
        scaleLevel: 10,
        
        // 图片变换状态
        imageScale: 1,
        imageX: 0,
        imageY: 0,
        isDraggingImage: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartImageX: 0,
        dragStartImageY: 0,
        
        // 缩略图状态
        isInThumbnailMode: savedSettings.thumbnailMode || false,
        savedWindowSize: null,
        savedWindowCenter: null,
        savedThumbnailPosition: savedSettings.savedThumbnailPosition || null
    };
    
    // 缩略图模式切换处理
    async function handleThumbnailToggle(enabled) {
        if (enabled) {
            await enterThumbnailMode(currentWindow, states);
        } else {
            await exitThumbnailMode(currentWindow, states);
        }
        applyImageTransform(img, states);
    }
    
    async function onToggleThumbnail() {
        const isCurrentlyThumbnail = document.body.classList.contains('thumbnail-mode');
        await handleThumbnailToggle(!isCurrentlyThumbnail);
        const settings = loadSettings();
        settings.thumbnailMode = !isCurrentlyThumbnail;
        saveSettings(settings);
    }
    
    // 设置右键菜单
    await createContextMenu(currentWindow, states, handleThumbnailToggle);
    
    // 设置大小指示器
    setupSizeIndicatorEvents(sizeIndicator);
    
    // 设置鼠标事件
    setupMouseDown(img, currentWindow, states);
    setupMouseMove(img, currentWindow, states);
    
    setupMouseUp(img, states, onToggleThumbnail, currentWindow);
    setupWheel(img, sizeIndicator, currentWindow, states);
    setupDoubleClick(img);
    preventDefaults(img);
    
    // 加载图片
    try {
        const data = await invoke('get_pin_image_data');
        
        if (data && data.file_path) {
            const assetUrl = convertFileSrc(data.file_path, 'asset');
            img.src = assetUrl;

            img.width = data.width;
            img.height = data.height;
            states.originalImageSize = { width: data.width, height: data.height };
            states.initialSize = { width: data.width, height: data.height };
        }
        
        // 应用保存的设置
        if (savedSettings.alwaysOnTop) {
            await currentWindow.setAlwaysOnTop(true);
        }

        if (savedSettings.shadow) {
            document.body.classList.add('shadow-enabled');
        }
        
        if (savedSettings.opacity !== 100) {
            img.style.opacity = savedSettings.opacity / 100;
        }
        
        if (savedSettings.pixelRender) {
            img.style.imageRendering = 'pixelated';
        }
        
        // 重置缩略图模式状态（避免启动时状态不一致）
        if (savedSettings.thumbnailMode) {
            states.isInThumbnailMode = false;
            states.thumbnail.enabled = false;
            const resetSettings = loadSettings();
            resetSettings.thumbnailMode = false;
            saveSettings(resetSettings);
        }
    } catch (error) {
        console.error('加载图片失败:', error);
    }
})();

