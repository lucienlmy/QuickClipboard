/**
 * 通用右键菜单前端逻辑
 */

import '@tabler/icons-webfont/dist/tabler-icons.min.css';

import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
document.addEventListener('contextmenu', event => event.preventDefault());
const currentWindow = getCurrentWindow();
const menuContainer = document.getElementById('menuContainer');

let currentOptions = null;
let initialMenuSize = null; // 保存主菜单的初始大小

// 应用主题
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'light') {
        document.body.classList.remove('dark-theme');
    } else if (theme === 'auto' || !theme) {
        // 自动检测系统主题
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (isDark) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}

// 创建子菜单
function createSubmenu(items) {
    const submenu = document.createElement('div');
    submenu.className = 'submenu-container';
    
    items.forEach(item => {
        const menuItemElement = createMenuItem(item);
        submenu.appendChild(menuItemElement);
    });
    
    return submenu;
}

// 恢复窗口到主菜单初始大小
async function restoreWindowSize() {
    if (!initialMenuSize) return;
    
    try {
        const size = new LogicalSize(initialMenuSize.width, initialMenuSize.height);
        await currentWindow.setSize(size);
    } catch (error) {
        console.error('恢复窗口大小失败:', error);
    }
}

// 调整子菜单位置并扩展窗口
async function positionSubmenu(submenu, parentItem) {
    const parentRect = parentItem.getBoundingClientRect();
    const menuRect = menuContainer.getBoundingClientRect();
    const bodyPadding = 16; // body 的 8px * 2
    
    // 子菜单相对于 menuContainer 定位
    const relativeTop = parentRect.top - menuRect.top;
    
    // 默认显示在右侧，与父菜单项对齐
    submenu.style.left = (menuRect.width - 4) + 'px';
    submenu.style.top = relativeTop + 'px';
    submenu.style.right = 'auto';
    
    setTimeout(async () => {
        const submenuRect = submenu.getBoundingClientRect();
        
        // 计算窗口需要的宽度（主菜单 + 子菜单 - 重叠 + body padding）
        const menuWidth = Math.ceil(menuRect.width + submenuRect.width - 4);
        const windowWidth = menuWidth + bodyPadding;
        
        // 计算窗口需要的高度（取主菜单和子菜单底部中较大的 + body padding）
        const submenuBottom = relativeTop + submenuRect.height;
        const menuHeight = Math.ceil(Math.max(menuRect.height, submenuBottom + 8));
        const windowHeight = menuHeight + bodyPadding;
        
        try {
            const size = new LogicalSize(windowWidth, windowHeight);
            await currentWindow.setSize(size);
            
            // 如果子菜单超出菜单容器底部，向上调整
            if (submenuBottom > menuHeight - 8) {
                const overflow = submenuBottom - menuHeight + 8;
                submenu.style.top = (relativeTop - overflow) + 'px';
            }
        } catch (error) {
            console.error('调整窗口大小失败:', error);
        }
    }, 0);
}

// 创建菜单项
function createMenuItem(item) {
    // 如果是分割线
    if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        return separator;
    }

    // 创建菜单项
    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    if (item.disabled) {
        menuItem.classList.add('disabled');
    }
    menuItem.dataset.itemId = item.id;
    
    // 如果有子菜单，标记为有子菜单
    const hasChildren = item.children && item.children.length > 0;
    if (hasChildren) {
        menuItem.classList.add('has-submenu');
    }

    // 图标（优先使用 favicon，其次使用 icon）
    if (item.favicon) {
        // 使用 favicon URL
        const iconContainer = document.createElement('div');
        iconContainer.className = 'menu-item-icon';
        const faviconImg = document.createElement('img');
        faviconImg.src = item.favicon;
        faviconImg.style.width = '16px';
        faviconImg.style.height = '16px';
        faviconImg.style.objectFit = 'contain';
        iconContainer.appendChild(faviconImg);
        menuItem.appendChild(iconContainer);
    } else if (item.icon) {
        // 使用图标类名
        const icon = document.createElement('i');
        icon.className = `menu-item-icon ${item.icon}`;
        menuItem.appendChild(icon);
    } else {
        // 占位空间保持对齐
        const iconPlaceholder = document.createElement('div');
        iconPlaceholder.className = 'menu-item-icon';
        menuItem.appendChild(iconPlaceholder);
    }

    // 文本
    const label = document.createElement('div');
    label.className = 'menu-item-label';
    label.textContent = item.label;
    menuItem.appendChild(label);

    // 子菜单指示器
    if (hasChildren) {
        const indicator = document.createElement('i');
        indicator.className = 'menu-item-submenu-indicator ti ti-chevron-right';
        menuItem.appendChild(indicator);
        
        // 创建子菜单容器并添加到 menuContainer（相对定位）
        const submenu = createSubmenu(item.children);
        menuContainer.appendChild(submenu);
        
        // 存储子菜单引用到菜单项，以便清理
        menuItem.submenuElement = submenu;
        
        // 有子菜单的项也支持点击
        if (!item.disabled) {
            menuItem.addEventListener('click', (e) => {
                if (!e.target.classList.contains('menu-item-submenu-indicator')) {
                    e.stopPropagation();
                    hideMenu(item.id);
                }
            });
        }
        
        // 鼠标悬停显示子菜单
        let showTimeout;
        menuItem.addEventListener('mouseenter', () => {
            clearTimeout(showTimeout);
            // 延迟显示，避免误触
            showTimeout = setTimeout(() => {
                // 隐藏其他子菜单
                document.querySelectorAll('.submenu-container.show').forEach(s => {
                    if (s !== submenu) {
                        s.classList.remove('show');
                    }
                });
                submenu.classList.add('show');
                positionSubmenu(submenu, menuItem);
            }, 100);
        });
        
        menuItem.addEventListener('mouseleave', (e) => {
            clearTimeout(showTimeout);
            // 如果鼠标移动到子菜单，不隐藏
            if (!submenu.contains(e.relatedTarget)) {
                setTimeout(async () => {
                    if (!submenu.matches(':hover') && !menuItem.matches(':hover')) {
                        submenu.classList.remove('show');
                        // 检查是否所有子菜单都已隐藏
                        const anySubmenuVisible = document.querySelector('.submenu-container.show');
                        if (!anySubmenuVisible) {
                            await restoreWindowSize();
                        }
                    }
                }, 100);
            }
        });
        
        // 子菜单鼠标离开事件
        submenu.addEventListener('mouseleave', (e) => {
            if (!menuItem.contains(e.relatedTarget)) {
                setTimeout(async () => {
                    if (!submenu.matches(':hover') && !menuItem.matches(':hover')) {
                        submenu.classList.remove('show');
                        // 检查是否所有子菜单都已隐藏
                        const anySubmenuVisible = document.querySelector('.submenu-container.show');
                        if (!anySubmenuVisible) {
                            await restoreWindowSize();
                        }
                    }
                }, 100);
            }
        });
    } else {
        // 没有子菜单的项，点击时隐藏菜单
        if (!item.disabled) {
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                hideMenu(item.id);
            });
        }
    }

    return menuItem;
}

// 渲染菜单
function renderMenu(options) {
    currentOptions = options;
    
    // 应用主题
    applyTheme(options.theme);

    // 清空容器
    menuContainer.innerHTML = '';

    // 渲染所有菜单项
    options.items.forEach(item => {
        const menuItemElement = createMenuItem(item);
        menuContainer.appendChild(menuItemElement);
    });
}

let isClosing = false;

// 加载菜单配置并渲染
async function loadAndRenderMenu() {
    // 立即重置关闭标志，防止窗口显示时的 blur 事件被忽略
    isClosing = false;
    
    try {
        const options = await invoke('get_context_menu_options');
        renderMenu(options);
        
        // 等待 DOM 更新后保存初始窗口大小（包含 body padding）
        await new Promise(resolve => setTimeout(resolve, 0));
        const windowSize = await currentWindow.innerSize();
        const scaleFactor = await currentWindow.scaleFactor();
        
        // innerSize 返回的是物理尺寸，转换为逻辑尺寸保存
        initialMenuSize = {
            width: Math.round(windowSize.width / scaleFactor),
            height: Math.round(windowSize.height / scaleFactor)
        };
        
        // 窗口加载完成后立即聚焦
        await currentWindow.setFocus();
    } catch (error) {
        console.error('获取菜单配置失败:', error);
    }
}

// 页面首次加载
loadAndRenderMenu();

// 监听后端的重新加载事件（窗口复用时会触发）
let reloadListenerRegistered = false;
if (!reloadListenerRegistered) {
    currentWindow.listen('reload-menu', () => {
        loadAndRenderMenu();
    });
    reloadListenerRegistered = true;
}

// 隐藏菜单窗口并清理状态
async function hideMenu(itemId = null) {
    if (isClosing) return;
    isClosing = true;
    
    try {
        await invoke('submit_context_menu', { itemId: itemId || null });
        
        // 清理所有子菜单状态
        document.querySelectorAll('.submenu-container').forEach(submenu => {
            submenu.classList.remove('show');
        });
        
        // 恢复窗口初始大小
        await restoreWindowSize();
        
        // 隐藏窗口（不销毁，下次复用）
        // 注意：后端会延迟 200ms 才设置菜单为不可见，window_management 中统一检查
        await currentWindow.hide();
    } catch (error) {
        console.error('隐藏菜单失败:', error);
    }
}

// 点击窗口外部隐藏菜单
window.addEventListener('blur', () => {
    hideMenu(null);
});

// ESC 键隐藏菜单
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideMenu(null);
    }
});

