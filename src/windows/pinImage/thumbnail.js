//缩略图模式模块

import { invoke } from '@tauri-apps/api/core';
import { loadSettings, saveSettings } from './settings.js';

const THUMBNAIL_SIZE = 50;

//进入缩略图模式
export async function enterThumbnailMode(window, state) {
    try {
        const currentSize = await window.innerSize();
        const currentPosition = await window.outerPosition();
        const scaleFactor = await window.scaleFactor();
        
        state.savedWindowSize = {
            width: currentSize.width / scaleFactor,
            height: currentSize.height / scaleFactor,
            x: currentPosition.x,
            y: currentPosition.y
        };
        
        const centerX = currentPosition.x + currentSize.width / 2;
        const centerY = currentPosition.y + currentSize.height / 2;
        state.savedWindowCenter = { x: centerX, y: centerY };
        
        const thumbnailPhysicalSize = THUMBNAIL_SIZE * scaleFactor;
        
        let newX, newY;
        
        const restoreMode = state.thumbnailRestoreMode || 'follow';
        
        if (restoreMode === 'keep' && state.savedThumbnailPosition) {
            newX = state.savedThumbnailPosition.x;
            newY = state.savedThumbnailPosition.y;
        } else {
            newX = Math.round(centerX - thumbnailPhysicalSize / 2);
            newY = Math.round(centerY - thumbnailPhysicalSize / 2);
        }
        
        await invoke('animate_window_resize', {
            startWidth: currentSize.width,
            startHeight: currentSize.height,
            startX: currentPosition.x,
            startY: currentPosition.y,
            endWidth: thumbnailPhysicalSize,
            endHeight: thumbnailPhysicalSize,
            endX: newX,
            endY: newY,
            durationMs: 300
        });
        
        state.imageScale = 1;
        state.imageX = 0;
        state.imageY = 0;
        
        document.body.classList.add('thumbnail-mode');
        
        state.isInThumbnailMode = true;
    } catch (error) {
        console.error('进入缩略图模式失败:', error);
    }
}

//退出缩略图模式
export async function exitThumbnailMode(window, state) {
    try {
        if (state.savedWindowSize && state.savedWindowCenter) {
            const currentSize = await window.innerSize();
            const currentPosition = await window.outerPosition();
            const scaleFactor = await window.scaleFactor();
            
            state.savedThumbnailPosition = {
                x: currentPosition.x,
                y: currentPosition.y
            };

            const settings = loadSettings();
            settings.savedThumbnailPosition = state.savedThumbnailPosition;
            saveSettings(settings);

            const restoreMode = state.thumbnailRestoreMode || 'follow';
            
            let centerX, centerY;
            
            if (restoreMode === 'keep') {
                centerX = state.savedWindowCenter.x;
                centerY = state.savedWindowCenter.y;
            } else {
                centerX = currentPosition.x + currentSize.width / 2;
                centerY = currentPosition.y + currentSize.height / 2;
            }
            
            const endWidth = state.savedWindowSize.width * scaleFactor;
            const endHeight = state.savedWindowSize.height * scaleFactor;
            const endX = Math.round(centerX - endWidth / 2);
            const endY = Math.round(centerY - endHeight / 2);
            
            await invoke('animate_window_resize', {
                startWidth: currentSize.width,
                startHeight: currentSize.height,
                startX: currentPosition.x,
                startY: currentPosition.y,
                endWidth: endWidth,
                endHeight: endHeight,
                endX: endX,
                endY: endY,
                durationMs: 300
            });
            
            if (state.initialSize) {
                state.scaleLevel = Math.round((state.savedWindowSize.width / state.initialSize.width) * 10);
            }

            state.imageScale = 1;
            state.imageX = 0;
            state.imageY = 0;
        }
        
        document.body.classList.remove('thumbnail-mode');
        
        state.isInThumbnailMode = false;
        state.savedWindowSize = null;
        state.savedWindowCenter = null;
    } catch (error) {
        console.error('退出缩略图模式失败:', error);
    }
}

