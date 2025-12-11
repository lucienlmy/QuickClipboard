import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

document.addEventListener('contextmenu', e => e.preventDefault());

const currentWindow = getCurrentWindow();
const menuContainer = document.getElementById('menuContainer');
const systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

const TRAY_BOTTOM_MARGIN = 50;
const BODY_PADDING = 8;
const SHADOW_MARGIN = 5;
const MAX_SPACE = 210;

let currentThemeSetting = null;
let monitorInfo = { x: 0, y: 0, width: 1920, height: 1080 };
let windowOrigin = { x: 0, y: 0 };
let scaleFactor = 1;
let textScale = 1;
let isTrayMenu = false;

const cssToLogical = v => v * textScale;
const logicalToCss = v => v / textScale;

function applyTheme(theme) {
    currentThemeSetting = theme;
    const isDark = theme === 'dark' || (theme !== 'light' && systemThemeMediaQuery.matches);
    document.body.classList.toggle('dark-theme', isDark);
}

systemThemeMediaQuery.addEventListener('change', e => {
    if (!currentThemeSetting || currentThemeSetting === 'auto') {
        document.body.classList.toggle('dark-theme', e.matches);
    }
});

function updateScrollIndicator(el) {
    if (el) el.classList.toggle('has-scroll', el.scrollHeight > el.clientHeight);
}

function createSubmenu(items) {
    const submenu = document.createElement('div');
    submenu.className = 'submenu-container';
    submenu.style.maxWidth = '200px';
    items.forEach(item => submenu.appendChild(createMenuItem(item)));
    submenu.addEventListener('scroll', () => updateScrollIndicator(submenu));
    return submenu;
}

async function resizeWindowToFitMenu() {
    const padding = 10;
    const mainRect = menuContainer.getBoundingClientRect();
    let maxX = mainRect.right, maxY = mainRect.bottom;
    
    document.querySelectorAll('.submenu-container.show').forEach(sub => {
        const rect = sub.getBoundingClientRect();
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
    });

    await invoke('resize_context_menu', {
        width: Math.ceil(maxX + padding),
        height: Math.ceil(maxY + padding),
        x: monitorInfo.x + windowOrigin.x * scaleFactor,
        y: monitorInfo.y + windowOrigin.y * scaleFactor
    }).catch(() => {});
}

function positionSubmenu(submenu, parentItem) {
    const menuRect = menuContainer.getBoundingClientRect();
    const parentRect = parentItem.getBoundingClientRect();
    const screenWidth = monitorInfo.width - windowOrigin.x;
    const bottomMargin = isTrayMenu ? TRAY_BOTTOM_MARGIN : 0;
    const screenHeight = monitorInfo.height - bottomMargin - windowOrigin.y;

    submenu.style.cssText = `max-width:200px;max-height:400px;overflow-y:auto;left:${menuRect.width}px;top:0`;
    
    const submenuRect = submenu.getBoundingClientRect();
    const spaceRight = screenWidth - cssToLogical(menuRect.left + menuRect.width);
    const spaceLeft = cssToLogical(menuRect.left) + windowOrigin.x;

    if (spaceRight >= cssToLogical(submenuRect.width) || spaceLeft < cssToLogical(submenuRect.width)) {
        submenu.style.left = menuRect.width + 'px';
        submenu.style.right = 'auto';
    } else {
        submenu.style.left = 'auto';
        submenu.style.right = menuRect.width + 'px';
    }

    let top = parentRect.top - menuRect.top;
    const bottomSpace = screenHeight - cssToLogical(menuRect.top + top + submenuRect.height);
    if (bottomSpace < 0) top += logicalToCss(bottomSpace);
    const topSpace = cssToLogical(menuRect.top) + windowOrigin.y + cssToLogical(top);
    if (topSpace < 0) top -= logicalToCss(topSpace);

    submenu.style.top = top + 'px';
    updateScrollIndicator(submenu);
}


function createMenuItem(item) {
    if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        return separator;
    }

    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    if (item.disabled) menuItem.classList.add('disabled');
    menuItem.dataset.itemId = item.id;

    const hasChildren = item.children?.length > 0;
    if (hasChildren) menuItem.classList.add('has-submenu');

    if (item.favicon) {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'menu-item-icon';
        const img = document.createElement('img');
        img.src = item.favicon;
        img.style.cssText = 'width:16px;height:16px;object-fit:contain';
        iconContainer.appendChild(img);
        menuItem.appendChild(iconContainer);
    } else if (item.icon) {
        const icon = document.createElement('i');
        icon.className = `menu-item-icon ${item.icon}`;
        if (item.icon_color) icon.style.color = item.icon_color;
        menuItem.appendChild(icon);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'menu-item-icon';
        menuItem.appendChild(placeholder);
    }

    const label = document.createElement('div');
    label.className = 'menu-item-label';
    label.textContent = item.label;
    label.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
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

        let hideTimeout;
        const showSubmenu = () => {
            document.querySelectorAll('.submenu-container.show').forEach(s => {
                if (s !== submenu) s.classList.remove('show');
            });
            submenu.classList.add('show');
            positionSubmenu(submenu, menuItem);
            resizeWindowToFitMenu();
            sendMenuRegionsToBackend();
        };
        const hideSubmenu = () => {
            submenu.classList.remove('show');
            resizeWindowToFitMenu();
            sendMenuRegionsToBackend();
        };

        menuItem.addEventListener('mouseenter', () => {
            if (item.disabled) return;
            clearTimeout(hideTimeout);
            showSubmenu();
        });
        menuItem.addEventListener('mouseleave', (e) => {
            if (!submenu.contains(e.relatedTarget)) hideTimeout = setTimeout(hideSubmenu, 200);
        });
        submenu.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
        submenu.addEventListener('mouseleave', (e) => {
            if (!menuItem.contains(e.relatedTarget)) hideTimeout = setTimeout(hideSubmenu, 200);
        });
        submenu.addEventListener('click', (e) => e.stopPropagation());
    } else if (!item.disabled) {
        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            hideMenu(item.id);
        });
    }

    if (item.preview_image) {
        let timer = null;
        menuItem.addEventListener('mouseenter', () => {
            timer = setTimeout(() => {
                invoke('pin_image_from_file', { filePath: item.preview_image, previewMode: true }).catch(() => {});
            }, 300);
        });
        menuItem.addEventListener('mouseleave', () => {
            if (timer) { clearTimeout(timer); timer = null; }
            invoke('close_image_preview').catch(() => {});
        });
    }

    return menuItem;
}


function positionMenuAtCursor(options) {
    const menuRect = menuContainer.getBoundingClientRect();
    const screenWidth = monitorInfo.width;
    const screenHeight = monitorInfo.height - (isTrayMenu ? TRAY_BOTTOM_MARGIN : 0);

    const menuCssWidth = menuRect.width + BODY_PADDING * 2 + SHADOW_MARGIN;
    const menuCssHeight = menuRect.height + BODY_PADDING * 2 + SHADOW_MARGIN;
    const menuLogicalW = cssToLogical(menuCssWidth);
    const menuLogicalH = cssToLogical(menuCssHeight);

    let left = Math.max(0, Math.min(options.cursor_x, screenWidth - menuLogicalW));
    let top = isTrayMenu 
        ? Math.max(0, options.cursor_y - menuLogicalH)
        : Math.max(0, Math.min(options.cursor_y, screenHeight - menuLogicalH));

    const leftSpace = Math.min(logicalToCss(left), MAX_SPACE);
    const topSpace = Math.min(logicalToCss(top), MAX_SPACE);
    
    windowOrigin = { 
        x: left - cssToLogical(leftSpace), 
        y: top - cssToLogical(topSpace) 
    };
    
    menuContainer.style.left = `${Math.round(leftSpace)}px`;
    menuContainer.style.top = `${Math.round(topSpace)}px`;
}

async function renderMenu(options) {
    scaleFactor = await currentWindow.scaleFactor().catch(() => 1);
    textScale = await invoke('get_system_text_scale').catch(() => 1);
    isTrayMenu = options.is_tray_menu || false;
    
    monitorInfo = {
        x: options.monitor_x || 0, 
        y: options.monitor_y || 0,
        width: options.monitor_width || 1920, 
        height: options.monitor_height || 1080
    };
    windowOrigin = { x: 0, y: 0 };
    
    applyTheme(options.theme);
    menuContainer.innerHTML = '';
    options.items.forEach(item => menuContainer.appendChild(createMenuItem(item)));
    positionMenuAtCursor(options);
    menuContainer.style.visibility = 'visible';
    
    await resizeWindowToFitMenu();
    sendMenuRegionsToBackend();
}

let isClosing = false;

async function loadAndRenderMenu() {
    isClosing = false;
    const options = await invoke('get_context_menu_options').catch(() => null);
    if (options) await renderMenu(options);
}

async function hideMenu(itemId = null) {
    if (isClosing) return;
    isClosing = true;
    await invoke('submit_context_menu', { itemId: itemId || null }).catch(() => {});
    document.querySelectorAll('.submenu-container').forEach(s => s.classList.remove('show'));
    menuContainer.style.visibility = 'hidden';
    await currentWindow.hide();
}

loadAndRenderMenu();
currentWindow.listen('reload-menu', loadAndRenderMenu);
currentWindow.listen('close-context-menu', () => hideMenu(null));

async function sendMenuRegionsToBackend() {
    const totalScale = scaleFactor * textScale;
    const windowPhysX = monitorInfo.x + windowOrigin.x * scaleFactor;
    const windowPhysY = monitorInfo.y + windowOrigin.y * scaleFactor;
    
    const toRegion = rect => ({
        x: Math.round(windowPhysX + rect.left * totalScale),
        y: Math.round(windowPhysY + rect.top * totalScale),
        width: Math.round(rect.width * totalScale),
        height: Math.round(rect.height * totalScale)
    });

    const mainMenu = toRegion(menuContainer.getBoundingClientRect());
    const submenus = Array.from(document.querySelectorAll('.submenu-container.show'))
        .map(s => toRegion(s.getBoundingClientRect()));

    await invoke('update_context_menu_regions', { mainMenu, submenus }).catch(() => {});
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(null); });
