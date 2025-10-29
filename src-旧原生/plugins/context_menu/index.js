import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
document.addEventListener('contextmenu', event => event.preventDefault());
// 显示右键菜单
export async function showContextMenu(options) {
    try {
        const currentWindow = getCurrentWindow();
        
        const outerPosition = await currentWindow.outerPosition();
        const outerSize = await currentWindow.outerSize();
        const innerSize = await currentWindow.innerSize();
        const scaleFactor = await currentWindow.scaleFactor();
        
        // 转换物理坐标为逻辑坐标
        const logicalWindowX = outerPosition.x / scaleFactor;
        const logicalWindowY = outerPosition.y / scaleFactor;
        const titleBarHeight = (outerSize.height - innerSize.height) / scaleFactor;
        
        const screenX = logicalWindowX + options.x;
        const screenY = logicalWindowY + titleBarHeight + options.y;
        
        const result = await invoke('show_context_menu', {
            items: options.items,
            x: Math.round(screenX),
            y: Math.round(screenY),
            width: options.width || null,
            theme: options.theme || null
        });
        
        return result;
    } catch (error) {
        console.error('显示右键菜单失败:', error);
        return null;
    }
}

// 从鼠标事件显示右键菜单
export async function showContextMenuFromEvent(event, items, extraOptions = {}) {
    event.preventDefault();
    event.stopPropagation();
    
    return await showContextMenu({
        items,
        x: event.clientX,
        y: event.clientY,
        ...extraOptions
    });
}

// 创建菜单项
export function createMenuItem(id, label, options = {}) {
    return {
        id,
        label,
        icon: options.icon || null,
        favicon: options.favicon || null,
        disabled: options.disabled || false,
        children: options.children || null,
        separator: false
    };
}

// 创建分隔线
export function createSeparator() {
    return {
        separator: true,
        id: '',
        label: ''
    };
}

// 关闭所有右键菜单窗口
export async function closeAllContextMenus() {
    try {
        await invoke('close_all_context_menus');
    } catch (error) {
        console.error('关闭右键菜单失败:', error);
    }
}
