// ==================== 窗口动画模块 ====================
// 负责处理窗口显示/隐藏的真实高度变化动画

import { invoke } from '@tauri-apps/api/core';

// 全局动画开关
let animationEnabled = true;

/**
 * 关闭所有打开的菜单
 */
async function closeAllOpenMenus() {
  try {
    // 关闭右键菜单窗口
    const { closeAllContextMenus } = await import('../plugins/context_menu/index.js');
    await closeAllContextMenus();
    
    // 关闭搜索引擎下拉菜单
    const searchEngineDropdown = document.querySelector('.search-engine-dropdown-menu');
    if (searchEngineDropdown) {
      searchEngineDropdown.remove();
    }
    
    // 移除搜索引擎下拉按钮的激活状态
    const activeDropdownBtns = document.querySelectorAll('.search-dropdown-btn.active');
    activeDropdownBtns.forEach(btn => {
      btn.classList.remove('active');
    });
    
    // 关闭自定义搜索引擎对话框
    const customSearchDialog = document.querySelector('.custom-search-dialog');
    if (customSearchDialog) {
      customSearchDialog.remove();
    }
    
    // 关闭对话框遮罩层
    const dialogOverlay = document.querySelector('.dialog-overlay');
    if (dialogOverlay) {
      dialogOverlay.remove();
    }
  } catch (error) {
    console.error('关闭菜单时出错:', error);
  }
}

/**
 * 播放窗口显示动画 - JavaScript控制的高度动画
 */
export async function playWindowShowAnimation() {
  const container = document.querySelector('body');
  if (!container) return;

  // 标记收到了真正的动画事件，阻止回退动画
  container.style.animation = 'none';
  
  // 检查动画开关
  if (!animationEnabled) {
    // 动画禁用时直接显示
    container.style.height = '100vh';
    container.style.maxHeight = '100vh';
    container.style.opacity = '1';
    container.style.overflow = 'hidden';
    
    // 恢复侧边栏
    const groupsSidebar = document.querySelector('.groups-sidebar');
    if (groupsSidebar) {
      groupsSidebar.style.visibility = 'visible';
      groupsSidebar.style.right = '';
      groupsSidebar.style.transform = '';
    }
    return;
  }
  
  // 添加动画进行中的标记
  container.classList.add('js-animating');
  
  // 获取侧边栏相关元素和状态
  const groupsSidebar = document.querySelector('.groups-sidebar');
  const isRightTitlebar = container.classList.contains('titlebar-right');
  
  // 确保初始状态
  container.style.height = '0';
  container.style.maxHeight = '0';
  container.style.opacity = '0';
  container.style.overflow = 'hidden';
  
  // 动画开始时无条件隐藏侧边栏（所有模式）
  if (groupsSidebar) {
    groupsSidebar.style.visibility = 'hidden';
  }
  
  // 强制重绘
  container.offsetHeight;
  
  // 执行展开动画
  await animateHeightExpand(container);
  
  // 移除动画标记
  container.classList.remove('js-animating');
}

/**
 * 播放窗口隐藏动画 - JavaScript控制的高度动画
 */
export async function playWindowHideAnimation() {
  const container = document.querySelector('body');
  if (!container) return;

  // 标记收到了真正的动画事件，阻止回退动画
  container.style.animation = 'none';
  
  // 检查动画开关
  if (!animationEnabled) {
    // 动画禁用时直接隐藏
    container.style.height = '0';
    container.style.maxHeight = '0';
    container.style.opacity = '0';
    
    // 隐藏侧边栏
    const groupsSidebar = document.querySelector('.groups-sidebar');
    if (groupsSidebar) {
      groupsSidebar.style.visibility = 'hidden';
    }
    return;
  }
  
  // 添加动画进行中的标记
  container.classList.add('js-animating');
  
  // 获取侧边栏相关元素和状态
  const groupsSidebar = document.querySelector('.groups-sidebar');
  const isRightTitlebar = container.classList.contains('titlebar-right');
  
  // 确保初始状态
  container.style.height = '100vh';
  container.style.maxHeight = '100vh';
  container.style.opacity = '1';
  container.style.overflow = 'hidden';
  
  // 动画开始时无条件隐藏侧边栏（所有模式）
  if (groupsSidebar) {
    groupsSidebar.style.visibility = 'hidden';
  }
  
  // 强制重绘
  container.offsetHeight;
  
  // 执行收起动画
  await animateHeightCollapse(container);
  
  // 移除动画标记
  container.classList.remove('js-animating');
}

/**
 * 高度展开动画 - 从上到下展开
 */
async function animateHeightExpand(container) {
    const footer = document.querySelector('.footer');
    const groupsSidebar = document.querySelector('.groups-sidebar');
  
    return new Promise((resolve) => {
      const duration = 600; // 稍长，给弹动留时间
      const startTime = performance.now();
      const targetHeight = window.innerHeight;
  
      function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
  
        // ========== 改进的两阶段动画：先展开，后弹动 ==========
        let eased;
        if (progress < 0.6) {
          // 前60%：smooth展开
          const expandProgress = progress / 0.5;
          eased = 1 - Math.pow(1 - expandProgress, 2.5); // 稍微缓和的ease-out
        } else {
          // 后40%：原来的阻尼弹簧效果
          const bounceProgress = (progress - 0.4) / 0.5;
          
          // ========== 阻尼弹簧公式 ==========
          const frequency = 12;   // 震荡频率
          const damping = 6;      // 阻尼系数
          let raw = 2 - Math.exp(-damping * bounceProgress) * Math.cos(frequency * bounceProgress);
          
          // ========== 映射到安全区间 ==========
          // 限制最大到 0.98，最后阶段平滑收敛到 1
          eased = Math.min(raw, 0.98);
          if (bounceProgress > 0.75) { // 在弹动的后25%时间平滑收敛
            const t = (bounceProgress - 0.75) / 0.25; // 0~1
            eased = eased + (1 - eased) * t;
          }
        }
  
        const currentHeight = targetHeight * eased;
  
        // 应用样式
        container.style.height = `${currentHeight}px`;
        container.style.maxHeight = `${currentHeight}px`;
        // 快速达到可见状态，让高度动画更明显
        container.style.opacity = Math.min(progress * 4, 1);
  
        if (footer) {
          const footerOffset = targetHeight - currentHeight;
          footer.style.transform = `translateY(${footerOffset}px)`;
          // 快速达到可见状态，让高度动画更明显
          footer.style.opacity = Math.min(progress * 4, 1);
        }
  
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // 最终状态
          container.style.height = '100vh';
          container.style.maxHeight = '100vh';
          container.style.opacity = '1';
          container.style.overflow = 'hidden';
  
          if (footer) {
            footer.style.transform = 'translateY(0)';
            footer.style.opacity = '1';
          }
  
          if (groupsSidebar) {
            groupsSidebar.style.visibility = 'visible';
            groupsSidebar.style.right = '';
            groupsSidebar.style.transform = '';
          }
  
          resolve();
        }
      }
  
      requestAnimationFrame(animate);
    });
  }
  

/**
 * 高度收起动画 - 从下到上收起
 */
async function animateHeightCollapse(container) {
  const footer = document.querySelector('.footer');
  const groupsSidebar = document.querySelector('.groups-sidebar');
  const isRightTitlebar = container.classList.contains('titlebar-right');
  
  return new Promise((resolve) => {
    const duration = 200; // 200ms 动画时长
    const startTime = performance.now();
    const startHeight = window.innerHeight; // 100vh 的像素值
    
    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 使用 ease-in 缓动函数
      const eased = Math.pow(progress, 2);
      
      // 计算当前高度（从完整到0）
      const currentHeight = startHeight * (1 - eased);
      
      // 设置容器样式
      container.style.height = `${currentHeight}px`;
      container.style.maxHeight = `${currentHeight}px`;
      container.style.opacity = 1 - eased;
      
      // 同步底部栏位置（向窗口底部移动）
      if (footer) {
        const footerOffset = startHeight - currentHeight;
        footer.style.transform = `translateY(${footerOffset}px)`;
        footer.style.opacity = 1 - eased;
      }
      
      // 侧边栏在动画期间保持隐藏状态
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // 动画完成，设置最终状态
        container.style.height = '0';
        container.style.maxHeight = '0';
        container.style.opacity = '0';
        
        // 重置底部栏位置
        if (footer) {
          footer.style.transform = 'translateY(0)';
          footer.style.opacity = '0';
        }
        
        // 分组侧边栏在隐藏动画结束后保持隐藏（整个窗口都要隐藏了）
        
        resolve();
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * 贴边显示弹动效果 - 专门用于贴边隐藏显示时的弹动
 */
export async function playEdgeSnapBounceEffect(direction = 'top') {
  const container = document.querySelector('body');
  if (!container) return;

  const groupsSidebar = document.querySelector('.groups-sidebar');
  if (groupsSidebar) {
    groupsSidebar.style.visibility = 'hidden';
  }

  // 检查动画开关
  if (!animationEnabled) {
    // 动画禁用时直接恢复侧边栏
    if (groupsSidebar) {
      groupsSidebar.style.visibility = 'visible';
      groupsSidebar.style.right = '';
      groupsSidebar.style.transform = '';
    }
    return;
  }

  const amplitude = 50; // 弹动幅度(px)
  const duration = 600; // 动画时长(ms)
  const startTime = performance.now();

  // GPU 优化：提示浏览器提前准备
  container.style.willChange = 'transform';

  return new Promise((resolve) => {
    let finished = false;

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 阻尼弹簧公式
      const frequency = Math.PI * 4; // 两次完整震荡
      const damping = 5;             // 阻尼系数
      const displacement =
        amplitude *
        Math.exp(-damping * progress) *
        Math.cos(frequency * progress);

      // 根据贴边方向设置位移
      let tx = 0, ty = 0;
      switch (direction) {
        case 'top':    ty = displacement; break;
        case 'bottom': ty = -displacement; break;
        case 'left':   tx = displacement; break;
        case 'right':  tx = -displacement; break;
      }

      container.style.transform = `translate(${tx}px, ${ty}px)`;

      // 恢复侧边栏
      if (groupsSidebar && progress > 0.8) {
        groupsSidebar.style.visibility = 'visible';
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // 结束时恢复状态
        container.style.transform = 'none';
        container.style.willChange = 'auto';

        if (groupsSidebar) {
          groupsSidebar.style.right = '';
          groupsSidebar.style.transform = '';
        }

        finished = true;
        resolve();
      }
    }

    requestAnimationFrame(animate);

    setTimeout(() => {
      if (!finished) {
        container.style.transform = 'none';
        container.style.willChange = 'auto';
        resolve();
      }
    }, duration + 200);
  });
}


/**
 * 设置窗口动画监听器
 */
export async function setupWindowAnimationListeners() {
  try {
    // console.log('开始设置窗口动画监听器...');
    const { listen } = await import('@tauri-apps/api/event');

    // 监听窗口显示动画事件
    await listen('window-show-animation', async () => {
      // console.log('收到窗口显示动画事件');
      playWindowShowAnimation();
      
      // 检查是否需要自动聚焦搜索框
      await handleAutoFocusSearch(true);
    });

    // 监听窗口隐藏动画事件
    await listen('window-hide-animation', async () => {
      // console.log('收到窗口隐藏动画事件');
      
      // 在动画开始前关闭所有打开的菜单
      await closeAllOpenMenus();
      
      playWindowHideAnimation();
      
      // 窗口隐藏时移除搜索框焦点
      await handleAutoFocusSearch(false);
    });

    // 监听贴边弹动动画事件（贴边显示）
    await listen('edge-snap-bounce-animation', async (event) => {
      const direction = event.payload;
      // console.log('收到贴边弹动动画事件:', direction);
      playEdgeSnapBounceEffect(direction);
      await handleAutoFocusSearch(true);
    });

    // 监听贴边隐藏事件
    await listen('edge-snap-hide-animation', async () => {
      // console.log('收到贴边隐藏动画事件');
      
      // 在隐藏前关闭所有打开的菜单
      await closeAllOpenMenus();
      
      await handleAutoFocusSearch(false);
    });

    // console.log('窗口动画监听器设置完成');
    
    // 直接恢复贴边隐藏状态，不再需要前端动画监听器
    await restoreEdgeSnapOnStartup();
  } catch (error) {
    console.error('设置窗口动画监听器失败:', error);
  }
}

/**
 * 处理自动聚焦搜索框
 */
async function handleAutoFocusSearch(isShowing) {
  try {
    if (isShowing) {
      // 窗口显示时，延迟一点时间再聚焦，确保动画完成
      setTimeout(async () => {
        try {
          // 使用 focus.js 中的自动聚焦函数
          const { autoFocusSearchIfEnabled } = await import('./focus.js');
          await autoFocusSearchIfEnabled();
        } catch (error) {
          console.error('自动聚焦搜索框失败:', error);
        }
      }, 300); // 延迟300ms，等待动画完成
    } else {
      // 窗口隐藏时，移除所有搜索框的焦点
      try {
        const { blurSearchInputs } = await import('./focus.js');
        blurSearchInputs();
      } catch (error) {
        console.error('移除搜索框焦点失败:', error);
      }
    }
  } catch (error) {
    console.error('处理自动聚焦搜索框失败:', error);
  }
}

/**
 * 恢复贴边隐藏状态
 */
async function restoreEdgeSnapOnStartup() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('restore_edge_snap_on_startup');
  } catch (error) {
    console.error('恢复贴边隐藏状态失败:', error);
  }
}

/**
 * 确保动画安全回退机制
 */
export function setupAnimationFallback() {
  // 安全回退：确保界面在200ms后可见（如果没有收到动画事件）
  setTimeout(() => {
    const container = document.querySelector('body');
    if (container && !container.classList.contains('js-animating')) {
      // 如果没有动画在进行，说明可能没收到事件，直接显示
      container.style.height = '100vh';
      container.style.maxHeight = '100vh';
      container.style.opacity = '1';
      container.style.animation = 'none';
    }
  }, 200);
}

/**
 * 设置动画开关状态
 */
export function setAnimationEnabled(enabled) {
  animationEnabled = enabled;
  console.log('窗口动画开关状态:', enabled ? '启用' : '禁用');
}

/**
 * 获取动画开关状态
 */
export function isAnimationEnabled() {
  return animationEnabled;
}
