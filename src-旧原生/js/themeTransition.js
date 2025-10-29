/**
 * 主题切换动画 - 圆形扩展效果
 */
export async function applyThemeWithTransition(themeApplyCallback, options = {}) {
  const {
    duration = 600,          
    centerX = null,          
    centerY = null,          
    easing = 'ease-in-out'   
  } = options;

  // 计算圆形扩展的起
  const cx = centerX !== null ? centerX : window.innerWidth / 2;
  const cy = centerY !== null ? centerY : window.innerHeight / 2;

  // 计算需要覆盖整个屏幕的最大半径
  const maxRadius = Math.sqrt(
    Math.pow(Math.max(cx, window.innerWidth - cx), 2) +
    Math.pow(Math.max(cy, window.innerHeight - cy), 2)
  );

  let container = null;
  
  try {
    const cloneStartTime = performance.now();
    const oldThemeClone = clonePageContent();
    const cloneTime = performance.now() - cloneStartTime;
    
    if (cloneTime > 100) {
      if (themeApplyCallback) {
        await themeApplyCallback();
      }
      return;
    }
    
    const result = createTransitionContainer(oldThemeClone);
    container = result.container;
    const maskLayer = result.maskLayer;
    
    container.style.display = 'block';

    await new Promise(resolve => requestAnimationFrame(resolve));

    if (themeApplyCallback) {
      await themeApplyCallback();
    }

    await new Promise(resolve => requestAnimationFrame(resolve));

    await animateCircleReveal(maskLayer, cx, cy, maxRadius, duration, easing);

    container.remove();
    container = null;
    
  } catch (error) {
    console.error('主题切换动画失败:', error);
    // 发生错误时确保主题已应用
    if (themeApplyCallback) {
      await themeApplyCallback();
    }
    // 清理可能存在的过渡容器
    if (container) {
      container.remove();
    }
  }
}

// 克隆页面内容
function clonePageContent() {

  const clone = document.body.cloneNode(true);
  
  const existingContainer = clone.querySelector('#theme-transition-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  const scripts = clone.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  const hiddenElements = clone.querySelectorAll('[style*="display: none"], [style*="display:none"]');
  hiddenElements.forEach(el => el.remove());
  
  return clone;
}

// 创建过渡容器
function createTransitionContainer(oldThemeClone) {
  // 清理可能存在的旧容器
  const existingContainer = document.getElementById('theme-transition-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  
  const container = document.createElement('div');
  container.id = 'theme-transition-container';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 999999;
    pointer-events: none;
    display: none;
    overflow: hidden;
  `;
  
  // 旧主题层（使用圆形遮罩，从满屏逐渐缩小到消失）
  const maskLayer = document.createElement('div');
  maskLayer.className = 'theme-mask-layer';
  maskLayer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    will-change: clip-path;
  `;
  
  // 设置旧主题克隆的样式
  oldThemeClone.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    min-height: 100%;
    margin: 0;
    overflow: hidden;
  `;
  
  maskLayer.appendChild(oldThemeClone);
  container.appendChild(maskLayer);
  document.body.appendChild(container);
  
  return { container, maskLayer };
}

// 执行圆形揭示动画（旧主题从满屏缩小到圆心消失）
function animateCircleReveal(element, cx, cy, maxRadius, duration, easing) {
  return new Promise((resolve) => {
    const animation = element.animate(
      [
        { clipPath: `circle(${maxRadius * 1.5}px at ${cx}px ${cy}px)` },
        { clipPath: `circle(0% at ${cx}px ${cy}px)` }
      ],
      {
        duration: duration,
        easing: easing,
        fill: 'forwards'
      }
    );

    animation.onfinish = () => resolve();
  });
}

// 获取点击位置作为动画中心
export function getClickPosition(event) {
  if (event && event.clientX !== undefined && event.clientY !== undefined) {
    return {
      centerX: event.clientX,
      centerY: event.clientY
    };
  }
  return {};
}

// 快速主题切换（无动画）
export async function applyThemeWithoutTransition(themeApplyCallback) {
  if (themeApplyCallback) {
    await themeApplyCallback();
  }
}

// 清理过渡层
export function cleanupTransitionLayer() {
  const transitionLayer = document.getElementById('theme-transition-layer');
  if (transitionLayer) {
    transitionLayer.remove();
  }
}
