/**
 * 全屏Loading遮罩管理器
 */

let loadingOverlay = null;

export function showLoading(message = '处理中...') {

    hideLoading();

    loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';

    const loadingContent = document.createElement('div');
    loadingContent.className = 'loading-content';

    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';

    const messageEl = document.createElement('div');
    messageEl.className = 'loading-message';
    messageEl.textContent = message;
    
    loadingContent.appendChild(spinner);
    loadingContent.appendChild(messageEl);
    loadingOverlay.appendChild(loadingContent);

    loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999999999999;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    loadingContent.style.cssText = `
        background: var(--bg-primary, #ffffff);
        border-radius: 12px;
        padding: 32px 48px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        min-width: 200px;
        transform: scale(0.9);
        transition: transform 0.3s ease;
    `;
    
    spinner.style.cssText = `
        width: 48px;
        height: 48px;
        border: 4px solid var(--border-color, #e0e0e0);
        border-top-color: var(--primary-color, #4a89dc);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    `;
    
    messageEl.style.cssText = `
        color: var(--text-primary, #333333);
        font-size: 14px;
        font-weight: 500;
        text-align: center;
    `;

    if (!document.getElementById('loading-keyframes')) {
        const style = document.createElement('style');
        style.id = 'loading-keyframes';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(loadingOverlay);

    requestAnimationFrame(() => {
        loadingOverlay.style.opacity = '1';
        loadingContent.style.transform = 'scale(1)';
    });

    document.body.style.overflow = 'hidden';
}

/**
 * 隐藏全屏Loading遮罩
 */
export function hideLoading() {
    if (loadingOverlay && loadingOverlay.parentNode) {

        loadingOverlay.style.opacity = '0';
        const content = loadingOverlay.querySelector('.loading-content');
        if (content) {
            content.style.transform = 'scale(0.9)';
        }

        setTimeout(() => {
            if (loadingOverlay && loadingOverlay.parentNode) {
                loadingOverlay.parentNode.removeChild(loadingOverlay);
                loadingOverlay = null;
            }

            document.body.style.overflow = '';
        }, 300);
    }
}

/**
 * 更新Loading消息
 */
export function updateLoadingMessage(message) {
    if (loadingOverlay) {
        const messageEl = loadingOverlay.querySelector('.loading-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }
}

window.addEventListener('beforeunload', hideLoading);

