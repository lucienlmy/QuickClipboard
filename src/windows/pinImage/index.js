//贴图窗口主入口

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
    const savedSettings = loadSettings();

    const states = {
        shadow: { enabled: savedSettings.shadow },
        lockPosition: { locked: savedSettings.lockPosition },
        pixelRender: { enabled: savedSettings.pixelRender },
        thumbnail: { enabled: savedSettings.thumbnailMode || false },
        thumbnailRestoreMode: savedSettings.thumbnailRestoreMode || 'follow',

        mouseDown: false,
        hasMoved: false,
        mouseDownX: 0,
        mouseDownY: 0,

        initialSize: null,
        originalImageSize: null,
        scaleLevel: 10,

        imageScale: 1,
        imageX: 0,
        imageY: 0,
        isDraggingImage: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartImageX: 0,
        dragStartImageY: 0,

        isInThumbnailMode: savedSettings.thumbnailMode || false,
        savedWindowSize: null,
        savedWindowCenter: null,
        savedThumbnailPosition: savedSettings.savedThumbnailPosition || null
    };

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
        const newThumbnailState = !isCurrentlyThumbnail;

        states.thumbnail.enabled = newThumbnailState;

        await handleThumbnailToggle(newThumbnailState);
        const settings = loadSettings();
        settings.thumbnailMode = newThumbnailState;
        saveSettings(settings);
    }

    await createContextMenu(currentWindow, states, handleThumbnailToggle);

    setupSizeIndicatorEvents(sizeIndicator);

    setupMouseDown(img, currentWindow, states);
    setupMouseMove(img, currentWindow, states);

    setupMouseUp(img, states, onToggleThumbnail, currentWindow);
    setupWheel(img, sizeIndicator, currentWindow, states);
    setupDoubleClick(img);
    preventDefaults(img);

    try {
        const data = await invoke('get_pin_image_data', { window: currentWindow });
        console.log(data)
        if (data && data.file_path) {
            const assetUrl = convertFileSrc(data.file_path, 'asset');
            img.src = assetUrl;

            img.width = data.width;
            img.height = data.height;
            states.originalImageSize = { width: data.width, height: data.height };
            states.initialSize = { width: data.width, height: data.height };
        }

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

