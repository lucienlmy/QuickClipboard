// 通用右键菜单前端逻辑

import '@tabler/icons-webfont/dist/tabler-icons.min.css';

import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
document.addEventListener('contextmenu', event => event.preventDefault());
const currentWindow = getCurrentWindow();
const menuContainer = document.getElementById('menuContainer');

let currentOptions = null;
let initialMenuSize = null;

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'light') {
        document.body.classList.remove('dark-theme');
    } else if (theme === 'auto' || !theme) {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (isDark) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}

function updateScrollIndicator(element) {
    if (!element) return;
    
    const hasScroll = element.scrollHeight > element.clientHeight;
    if (hasScroll) {
        element.classList.add('has-scroll');
    } else {
        element.classList.remove('has-scroll');
    }
}

function createSubmenu(items) {
    const submenu = document.createElement('div');
    submenu.className = 'submenu-container';
    
    items.forEach(item => {
        const menuItemElement = createMenuItem(item);
        submenu.appendChild(menuItemElement);
    });
    
    submenu.addEventListener('scroll', () => {
        updateScrollIndicator(submenu);
    });
    
    return submenu;
}

async function restoreWindowSize() {
    if (!initialMenuSize) return;
    
    try {
        const size = new LogicalSize(initialMenuSize.width, initialMenuSize.height);
        await currentWindow.setSize(size);
    } catch (error) {
        console.error('恢复窗口大小失败:', error);
    }
}

async function positionSubmenu(submenu, parentItem) {
    const parentRect = parentItem.getBoundingClientRect();
    const menuRect = menuContainer.getBoundingClientRect();
    const bodyPadding = 16;
    
    const relativeTop = parentRect.top - menuRect.top;
    
    submenu.style.left = (menuRect.width - 4) + 'px';
    submenu.style.top = relativeTop + 'px';
    submenu.style.right = 'auto';
    
    setTimeout(async () => {
        const submenuRect = submenu.getBoundingClientRect();
        
        const scrollbarWidth = 8;
        const menuWidth = Math.ceil(menuRect.width + submenuRect.width - 4 + scrollbarWidth);
        const windowWidth = menuWidth + bodyPadding;
        
        const submenuMaxHeight = 400;
        const actualSubmenuHeight = Math.min(submenuRect.height, submenuMaxHeight);
        
        const submenuBottom = relativeTop + actualSubmenuHeight;
        const menuHeight = Math.ceil(Math.max(menuRect.height, submenuBottom + 8));
        const windowHeight = menuHeight + bodyPadding;
        
        try {
            const size = new LogicalSize(windowWidth, windowHeight);
            await currentWindow.setSize(size);
            
            const availableSpace = menuHeight - 8;
            if (submenuBottom > availableSpace) {
                const overflow = submenuBottom - availableSpace;
                const newTop = Math.max(0, relativeTop - overflow);
                submenu.style.top = newTop + 'px';
            }
            
            setTimeout(() => {
                updateScrollIndicator(submenu);
            }, 50);
        } catch (error) {
            console.error('调整窗口大小失败:', error);
        }
    }, 0);
}

function createMenuItem(item) {
    if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        return separator;
    }

    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    if (item.disabled) {
        menuItem.classList.add('disabled');
    }
    menuItem.dataset.itemId = item.id;
    
    const hasChildren = item.children && item.children.length > 0;
    if (hasChildren) {
        menuItem.classList.add('has-submenu');
    }

    if (item.favicon) {
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
        const icon = document.createElement('i');
        icon.className = `menu-item-icon ${item.icon}`;
        menuItem.appendChild(icon);
    } else {
        const iconPlaceholder = document.createElement('div');
        iconPlaceholder.className = 'menu-item-icon';
        menuItem.appendChild(iconPlaceholder);
    }

    const label = document.createElement('div');
    label.className = 'menu-item-label';
    label.textContent = item.label;
    menuItem.appendChild(label);

    if (hasChildren) {
        const indicator = document.createElement('i');
        indicator.className = 'menu-item-submenu-indicator ti ti-chevron-right';
        menuItem.appendChild(indicator);
        
        const submenu = createSubmenu(item.children);
        menuContainer.appendChild(submenu);
        
        menuItem.submenuElement = submenu;
        
        if (!item.disabled) {
            menuItem.addEventListener('click', (e) => {
                if (!e.target.classList.contains('menu-item-submenu-indicator')) {
                    e.stopPropagation();
                    hideMenu(item.id);
                }
            });
        }
        
        let showTimeout;
        menuItem.addEventListener('mouseenter', () => {
            clearTimeout(showTimeout);
            showTimeout = setTimeout(() => {
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
            if (!submenu.contains(e.relatedTarget)) {
                setTimeout(async () => {
                    if (!submenu.matches(':hover') && !menuItem.matches(':hover')) {
                        submenu.classList.remove('show');
                        const anySubmenuVisible = document.querySelector('.submenu-container.show');
                        if (!anySubmenuVisible) {
                            await restoreWindowSize();
                        }
                    }
                }, 100);
            }
        });
        
        submenu.addEventListener('mouseleave', (e) => {
            if (!menuItem.contains(e.relatedTarget)) {
                setTimeout(async () => {
                    if (!submenu.matches(':hover') && !menuItem.matches(':hover')) {
                        submenu.classList.remove('show');
                        const anySubmenuVisible = document.querySelector('.submenu-container.show');
                        if (!anySubmenuVisible) {
                            await restoreWindowSize();
                        }
                    }
                }, 100);
            }
        });
    } else {
        if (!item.disabled) {
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                hideMenu(item.id);
            });
        }
    }

    return menuItem;
}

function renderMenu(options) {
    currentOptions = options;

    applyTheme(options.theme);

    menuContainer.innerHTML = '';

    options.items.forEach(item => {
        const menuItemElement = createMenuItem(item);
        menuContainer.appendChild(menuItemElement);
    });
}

let isClosing = false;

async function loadAndRenderMenu() {
    isClosing = false;
    
    try {
        const options = await invoke('get_context_menu_options');
        renderMenu(options);

        await new Promise(resolve => setTimeout(resolve, 0));
        const windowSize = await currentWindow.innerSize();
        const scaleFactor = await currentWindow.scaleFactor();

        initialMenuSize = {
            width: Math.round(windowSize.width / scaleFactor),
            height: Math.round(windowSize.height / scaleFactor)
        };
    } catch (error) {
        console.error('获取菜单配置失败:', error);
    }
}

loadAndRenderMenu();

let reloadListenerRegistered = false;
if (!reloadListenerRegistered) {
    currentWindow.listen('reload-menu', () => {
        loadAndRenderMenu();
    });
    reloadListenerRegistered = true;
}

async function hideMenu(itemId = null) {
    if (isClosing) return;
    isClosing = true;
    
    try {
        await invoke('submit_context_menu', { itemId: itemId || null });

        document.querySelectorAll('.submenu-container').forEach(submenu => {
            submenu.classList.remove('show');
        });

        await restoreWindowSize();

        await currentWindow.hide();
    } catch (error) {
        console.error('隐藏菜单失败:', error);
    }
}

currentWindow.listen('close-context-menu', () => {
    hideMenu(null);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideMenu(null);
    }
});

