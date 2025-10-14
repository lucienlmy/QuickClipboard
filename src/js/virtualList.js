import Clusterize from 'clusterize.js';
import Sortable from 'sortablejs';
import LazyLoad from 'vanilla-lazyload';
import * as navigation from './navigation.js';

/**
 * 虚拟滚动列表类
 */
export class VirtualList {
  constructor(options) {
    this.scrollId = options.scrollId;
    this.contentId = options.contentId;
    this.data = options.data || [];
    this.renderItem = options.renderItem;
    this.onSort = options.onSort;
    this.onItemClick = options.onItemClick;
    this.onItemContextMenu = options.onItemContextMenu;
    this.sortableOptions = options.sortableOptions || {};

    this.clusterize = null;
    this.sortable = null;
    this.isDragging = false;
    this.lazyLoad = null;

    // 维护当前行高状态
    this.currentRowHeightSetting = localStorage.getItem('app-row-height') || 'medium';
    
    // 鼠标悬停优化
    this.hoverDebounceTimeout = null;
    this.lastHoverTarget = null;

    this.init();
  }

  init() {
    // 初始化 Clusterize
    this.clusterize = new Clusterize({
      rows: this.generateRows(),
      scrollId: this.scrollId,
      contentId: this.contentId,
      rows_in_block: 15, //块大小
      blocks_in_cluster: 4, // 缓冲区
      show_no_data_row: true,
      no_data_text: '暂无数据',
      no_data_class: 'clusterize-no-data'
    });

    // 初始化 Sortable
    this.initSortable();

    // 绑定事件
    this.bindEvents();

    // 监听行高变化
    this.bindRowHeightListener();

    // 初始化懒加载
    this.initLazyLoad();
  }

  initSortable() {
    const contentElement = document.getElementById(this.contentId);
    if (!contentElement) {
      return;
    }

    const defaultOptions = {
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onStart: (evt) => {
        this.isDragging = true;
        this.setDragData(evt);

        if (this.sortableOptions.onStart) {
          this.sortableOptions.onStart(evt);
        }
      },
      onEnd: (evt) => {
        setTimeout(() => {
          this.isDragging = false;
        }, 100);

        if (this.sortableOptions.onEnd) {
          this.sortableOptions.onEnd(evt);
        }

        if (evt.oldIndex !== evt.newIndex && this.onSort) {
          const realOldIndex = parseInt(evt.item.getAttribute('data-index'));
          let realNewIndex = realOldIndex;

          // 找到新位置的非拖拽元素来确定真实索引
          const elements = Array.from(evt.to.children);
          const isForward = evt.newIndex < evt.oldIndex; // 向上拖拽为true，向下为false

          // 调整向下拖拽时的搜索起始位置
          const searchStart = isForward ? evt.newIndex : evt.newIndex; // 向下拖拽时从newIndex开始找
          const searchEnd = isForward ? elements.length : 0;
          const searchStep = isForward ? 1 : -1;

          for (let i = searchStart; isForward ? i < searchEnd : i >= searchEnd; i += searchStep) {
            if (elements[i] && elements[i] !== evt.item) {
              const refIndex = parseInt(elements[i].getAttribute('data-index'));
              // 向下拖拽时直接使用参考元素索引，不加1
              realNewIndex = isForward ? refIndex : refIndex;
              break;
            }
          }

          // 特殊情况：如果没找到参考元素（拖拽到最末端）
          if (realNewIndex === realOldIndex) {
            // 向上拖拽到最前：newIndex=0
            // 向下拖拽到最后：newIndex=elements.length-1
            realNewIndex = isForward ? 0 : elements.length - 1;
          }

          if (realOldIndex !== realNewIndex) {
            console.log('oldIndex:', realOldIndex, 'newIndex:', realNewIndex);
            this.onSort(realOldIndex, realNewIndex);

            // 拖拽完成后重新设置data-index
            this.updateDataIndexesAfterDrag(realOldIndex, realNewIndex);

            // 拖拽完成后设置该项为激活状态
            setTimeout(() => {
              this.setDraggedItemActive(evt.item, realNewIndex);
            }, 50);
          }
        }
      }
    };

    const userOnEnd = this.sortableOptions.onEnd;
    const userOnStart = this.sortableOptions.onStart;

    const finalOptions = {
      ...this.sortableOptions,
      ...defaultOptions,
      onStart: defaultOptions.onStart,
      onEnd: defaultOptions.onEnd
    };

    this.sortableOptions.onEnd = userOnEnd;
    this.sortableOptions.onStart = userOnStart;

    this.sortable = Sortable.create(contentElement, finalOptions);
  }


  // 设置拖拽数据
  setDragData(evt) {
    const draggedElement = evt.item;
    const index = parseInt(draggedElement.getAttribute('data-index'));
    this.setDragDataForElement(evt.originalEvent, index);
  }

  // 为指定元素设置拖拽数据
  setDragDataForElement(event, index) {
    if (index >= 0 && index < this.data.length) {
      const item = this.data[index];
      let dragData = {};

      // 根据列表类型设置不同的拖拽数据
      if (this.scrollId === 'clipboard-list') {
        // 剪贴板列表 - 需要找到在原始数组中的索引
        const originalIndex = this.findOriginalIndex(item);
        dragData = {
          type: 'clipboard',
          index: originalIndex,
          content: item.content
        };
      } else if (this.scrollId === 'quick-texts-list') {
        // 常用文本列表
        dragData = {
          type: 'quicktext',
          id: item.id,
          content: item.content
        };
      }

      // 设置拖拽数据
      const dragDataString = JSON.stringify(dragData);

      // 使用自定义MIME类型和text/plain作为备用
      if (event && event.dataTransfer) {
        event.dataTransfer.setData('application/x-quickclipboard', dragDataString);
        event.dataTransfer.setData('text/plain', dragDataString);
      }
    }
  }

  // 查找项目在原始数组中的索引
  findOriginalIndex(item) {
    if (this.scrollId === 'clipboard-list') {
      // 通过时间戳和内容匹配找到原始索引
      try {
        // 尝试从全局作用域获取clipboardHistory
        const clipboardHistory = window.clipboardHistory || [];
        return clipboardHistory.findIndex(originalItem =>
          originalItem.content === item.content &&
          originalItem.created_at === item.created_at
        );
      } catch (error) {
        console.warn('无法获取原始剪贴板历史数组:', error);
        return -1;
      }
    }
    return -1;
  }

  // 设置拖拽项为激活状态
  setDraggedItemActive(draggedElement, newIndex) {
    try {
      // 更新拖拽元素的data-index属性为新索引
      draggedElement.setAttribute('data-index', newIndex.toString());
      navigation.syncClickedItem(draggedElement);
    } catch (error) {
      console.warn('设置拖拽项激活状态失败:', error);
    }
  }

  // 拖拽完成后更新所有相关元素的data-index
  updateDataIndexesAfterDrag(oldIndex, newIndex) {
    try {
      const contentElement = document.getElementById(this.contentId);
      if (!contentElement) return;

      const items = contentElement.querySelectorAll('[data-index]');
      if (!items || items.length === 0) return;

      // 确定索引范围
      const startIndex = Math.min(oldIndex, newIndex);
      const endIndex = Math.max(oldIndex, newIndex);

      // 更新受影响范围内的所有元素的data-index
      items.forEach(item => {
        const currentIndex = parseInt(item.getAttribute('data-index'));
        if (!isNaN(currentIndex)) {
          // 如果是拖拽元素本身，设置为新索引
          if (currentIndex === oldIndex) {
            item.setAttribute('data-index', newIndex.toString());
          }
          // 如果元素在拖拽路径上，根据拖拽方向调整索引
          else if (currentIndex >= startIndex && currentIndex <= endIndex) {
            if (oldIndex < newIndex) {
              // 向下拖拽，被拖拽元素经过的元素索引减1
              if (currentIndex > oldIndex && currentIndex <= newIndex) {
                item.setAttribute('data-index', (currentIndex - 1).toString());
              }
            } else {
              // 向上拖拽，被拖拽元素经过的元素索引加1
              if (currentIndex >= newIndex && currentIndex < oldIndex) {
                item.setAttribute('data-index', (currentIndex + 1).toString());
              }
            }
          }
        }
      });

      console.log(`拖拽后更新索引: ${oldIndex} -> ${newIndex}`);
    } catch (error) {
      console.warn('更新拖拽后的data-index失败:', error);
    }
  }



  bindEvents() {
    const contentElement = document.getElementById(this.contentId);
    if (!contentElement) return;

    // 使用事件委托处理点击事件
    contentElement.addEventListener('click', (e) => {
      if (this.isDragging) return;

      const item = e.target.closest('[data-index]');
      if (item && this.onItemClick) {
        const index = parseInt(item.getAttribute('data-index'));
        this.onItemClick(index, e);
      }
    });

    // 使用事件委托处理右键菜单
    contentElement.addEventListener('contextmenu', (e) => {
      if (this.isDragging) return;

      const item = e.target.closest('[data-index]');
      if (item && this.onItemContextMenu) {
        const index = parseInt(item.getAttribute('data-index'));
        this.onItemContextMenu(index, e);
      }
    });

    // 使用事件委托处理鼠标悬停事件，同步键盘选中状态
    contentElement.addEventListener('mouseenter', (e) => {
      if (this.isDragging) return;

      const item = e.target.closest('[data-index]');
      if (item) {
        // 如果是同一个元素，直接返回避免重复处理
        if (this.lastHoverTarget === item) {
          return;
        }
        
        this.lastHoverTarget = item;
        const index = parseInt(item.getAttribute('data-index'));
        
        if (!isNaN(index)) {
          // 清除之前的防抖定时器
          if (this.hoverDebounceTimeout) {
            clearTimeout(this.hoverDebounceTimeout);
          }
          
          // 使用较短的防抖延迟，既能避免频繁调用又不影响响应性
          this.hoverDebounceTimeout = setTimeout(() => {
            navigation.setCurrentSelectedIndex(index);
            this.hoverDebounceTimeout = null;
          }, 5); // 5ms防抖延迟
        }
      }
    }, true); // 使用捕获模式确保能够正确处理嵌套元素
    
    // 添加鼠标离开事件，清理状态
    contentElement.addEventListener('mouseleave', (e) => {
      if (this.isDragging) return;
      
      // 清除防抖定时器和缓存
      if (this.hoverDebounceTimeout) {
        clearTimeout(this.hoverDebounceTimeout);
        this.hoverDebounceTimeout = null;
      }
      this.lastHoverTarget = null;
    }, true);

    // 使用事件委托处理拖拽开始事件
    contentElement.addEventListener('dragstart', (e) => {
      const item = e.target.closest('[data-index]');
      if (item) {
        const index = parseInt(item.getAttribute('data-index'));
        this.setDragDataForElement(e, index);
      }
    });

    // 监听滚动事件，触发图片加载和管理滚动状态
    const scrollElement = document.getElementById(this.scrollId);
    if (scrollElement) {
      let scrollTimeout;
      scrollElement.addEventListener('scroll', () => {
        // 通知导航模块正在滚动
        navigation.setScrollingState(true);
        
        // 防抖处理，避免频繁触发
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          this.triggerImageLoad();
          
          // 滚动结束，通知导航模块
          navigation.setScrollingState(false);
        }, 150); // 增加延迟确保滚动完全停止
      });
    }
  }

  generateRows() {
    if (!this.data || this.data.length === 0) {
      return [];
    }

    return this.data.map((item, index) => {
      const html = this.renderItem(item, index);
      return html;
    });
  }

  updateData(newData) {
    this.data = newData;
    const rows = this.generateRows();
    this.clusterize.update(rows);

    // 更新数据后刷新懒加载
    this.triggerImageLoad();
  }

  appendData(newItems) {
    this.data = [...this.data, ...newItems];
    const newRows = newItems.map((item, index) => {
      const actualIndex = this.data.length - newItems.length + index;
      const html = this.renderItem(item, actualIndex);
      return html;
    });
    this.clusterize.append(newRows);
  }

  prependData(newItems) {
    this.data = [...newItems, ...this.data];
    const newRows = newItems.map((item, index) => {
      const html = this.renderItem(item, index);
      return html;
    });
    this.clusterize.prepend(newRows);

    // 更新所有现有项目的索引
    this.updateData(this.data);
  }

  clear() {
    this.data = [];
    this.clusterize.clear();
  }

  refresh() {
    this.clusterize.refresh();
  }

  destroy() {
    if (this.sortable) {
      this.sortable.destroy();
    }
    if (this.clusterize) {
      this.clusterize.destroy();
    }
    if (this.lazyLoad) {
      this.lazyLoad.destroy();
    }

    // 清理行高变化监听器
    if (this.rowHeightChangeHandler) {
      window.removeEventListener('row-height-changed', this.rowHeightChangeHandler);
    }

    // 清理标签页切换监听器
    if (this.tabSwitchHandler) {
      window.removeEventListener('tab-switched', this.tabSwitchHandler);
    }
  }

  getRowsAmount() {
    return this.clusterize ? this.clusterize.getRowsAmount() : 0;
  }

  getScrollProgress() {
    return this.clusterize ? this.clusterize.getScrollProgress() : 0;
  }

  // 滚动到指定索引
  scrollToIndex(index) {
    if (!this.clusterize || index < 0 || index >= this.data.length) {
      return false; // 返回是否成功滚动
    }

    const scrollElement = document.getElementById(this.scrollId);
    if (!scrollElement) return false;

    // 使用当前设定的行高
    const itemHeight = this.getCurrentRowHeight();

    // 计算目标滚动位置 - 让目标元素显示在视口顶部偏下一点
    const targetScrollTop = index * itemHeight;
    const containerHeight = scrollElement.clientHeight;

    // 添加小量偏移，避免元素刚好贴在视口顶部
    const offset = itemHeight * 0.1;
    const adjustedScrollTop = Math.max(0, targetScrollTop - offset);

    // 确保滚动位置在有效范围内
    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - containerHeight);
    const validScrollTop = Math.min(adjustedScrollTop, maxScrollTop);

    // 直接设置滚动位置
    scrollElement.scrollTo({
      top: validScrollTop,
      behavior: 'instant'
    });

    return true;
  }

  // 获取当前数据长度
  getDataLength() {
    return this.data ? this.data.length : 0;
  }

  // 根据当前行高设置获取项目高度
  getCurrentRowHeight() {
    const currentRowHeight = localStorage.getItem('app-row-height') || 'medium';

    switch (currentRowHeight) {
      case 'large':
        return 120; // 大
      case 'medium':
        return 90;  // 中
      case 'small':
        return 50;  // 小
      default:
        return 90;  // 默认中等
    }
  }

  // 根据行高名称获取对应的数值
  getCurrentRowHeightFromEvent(rowHeightName) {
    if (!rowHeightName) return 90; // 默认中等

    switch (rowHeightName) {
      case 'large':
        return 120; // 大
      case 'medium':
        return 90;  // 中
      case 'small':
        return 50;  // 小
      default:
        return 90;  // 默认中等
    }
  }

  // 获取当前视口中第一个可见元素的索引
  getFirstVisibleElementIndex() {
    const scrollElement = document.getElementById(this.scrollId);
    const contentElement = document.getElementById(this.contentId);

    if (!scrollElement || !contentElement) {
      return 0;
    }

    const scrollTop = scrollElement.scrollTop;
    const viewportHeight = scrollElement.clientHeight;

    // 如果滚动到顶部，直接返回0
    if (scrollTop <= 0) {
      return 0;
    }

    // 查找所有有效的项目元素
    const items = contentElement.querySelectorAll('[data-index]');
    let firstVisibleIndex = null;

    // 使用更精确的可见性检测
    for (let item of items) {
      const itemRect = item.getBoundingClientRect();
      const containerRect = scrollElement.getBoundingClientRect();

      // 计算相对于容器的位置
      const itemTop = itemRect.top - containerRect.top;
      const itemBottom = itemRect.bottom - containerRect.top;

      // 检查元素是否在视口内可见
      if (itemBottom > 0 && itemTop < viewportHeight) {
        const index = parseInt(item.getAttribute('data-index'));
        if (!isNaN(index)) {
          if (firstVisibleIndex === null || index < firstVisibleIndex) {
            firstVisibleIndex = index;
          }
        }
      }
    }

    // 如果找到了可见元素，返回最小的索引
    if (firstVisibleIndex !== null) {
      return firstVisibleIndex;
    }

    // 如果没找到，回退到基于滚动位置的计算
    const avgRowHeight = this.getCurrentRowHeight();
    const calculatedIndex = Math.floor(scrollTop / avgRowHeight);

    // 确保计算出的索引在有效范围内
    return Math.max(0, Math.min(calculatedIndex, this.data.length - 1));
  }

  // 绑定行高变化监听器
  bindRowHeightListener() {
    this.rowHeightChangeHandler = (event) => {
      // 行高改变时处理滚动位置，确保可见内容一致
      setTimeout(() => {
        const scrollElement = document.getElementById(this.scrollId);
        const contentElement = document.getElementById(this.contentId);

        if (scrollElement && contentElement && this.data && this.data.length > 0) {
          // 保存当前滚动位置
          const currentScrollTop = scrollElement.scrollTop;

          // 获取旧行高和新行高
          const oldRowHeight = this.getCurrentRowHeightFromEvent(this.currentRowHeightSetting);
          const newRowHeightName = localStorage.getItem('app-row-height') || 'medium';
          const newRowHeight = this.getCurrentRowHeightFromEvent(newRowHeightName);

          // 根据旧行高计算当前可见的第一个项目索引
          const firstVisibleIndex = Math.floor(currentScrollTop / oldRowHeight);

          // 确保索引在有效范围内
          const validIndex = Math.max(0, Math.min(firstVisibleIndex, this.data.length - 1));

          // 更新当前行高设置
          this.currentRowHeightSetting = newRowHeightName;

          // 强制刷新虚拟列表以重新计算块布局
          this.clusterize.refresh(true);

          // 根据新的行高和目标元素索引计算新的滚动位置
          setTimeout(() => {
            // 使用 scrollToIndex 方法精确定位到指定元素
            this.scrollToIndex(validIndex);

            // 再次刷新以确保虚拟列表正确渲染
            setTimeout(() => {
              this.clusterize.refresh(true);
            }, 50);
          }, 10);
        }
      }, 150);
    };

    // 监听标签页切换事件，在切换时刷新虚拟列表并回到顶部
    this.tabSwitchHandler = () => {
      setTimeout(() => {
        const scrollElement = document.getElementById(this.scrollId);
        if (scrollElement && this.clusterize) {
          // 先滚动到顶部
          scrollElement.scrollTo({
            top: 0,
            behavior: 'instant'
          });

          // 强制刷新虚拟列表布局
          this.clusterize.refresh(true);

          // 再次确保滚动位置正确
          setTimeout(() => {
            scrollElement.scrollTop = 0;
            this.clusterize.refresh(true);
          }, 50);
        }
      }, 50);
    };

    window.addEventListener('row-height-changed', this.rowHeightChangeHandler);
    // 监听标签页切换
    window.addEventListener('tab-switched', this.tabSwitchHandler);
  }

  // 初始化懒加载
  initLazyLoad() {
    if (this.lazyLoad) {
      this.lazyLoad.destroy();
    }

    const scrollElement = document.getElementById(this.scrollId);
    if (!scrollElement) return;

    // 创建懒加载实例
    this.lazyLoad = new LazyLoad({
      elements_selector: '.lazy',
      container: scrollElement,
      threshold: 500,
      thresholds: '0px 500px 1000px',
      callback_enter: (el) => {
        const imageId = el.getAttribute('data-image-id');
        if (imageId) {
          if (!el.hasAttribute('data-loading')) {
            el.setAttribute('data-loading', 'true');
            this.loadImageById(el, imageId);
          }
        }
      },
      callback_loaded: (el) => {
        el.classList.remove('image-loading');
        el.classList.add('image-loaded');
      },
      callback_error: (el) => {
        el.classList.remove('image-loading');
        el.classList.add('image-error');
      }
    });
  }

  // 异步加载图片
  async loadImageById(imgElement, imageId) {
    try {
      const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
      const filePath = await invoke('get_image_file_path', { content: `image:${imageId}` });
      const assetUrl = convertFileSrc(filePath, 'asset');

      imgElement.setAttribute('data-src', assetUrl);
      imgElement.classList.remove('lazy'); 
      const tempImg = new Image();
      
      // 监听加载完成
      tempImg.onload = () => {
        imgElement.src = assetUrl;
        imgElement.removeAttribute('data-loading');
        imgElement.classList.remove('image-loading');
        imgElement.classList.add('image-loaded');
      };
      
      // 监听加载失败
      tempImg.onerror = () => {
        const errorSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2ZmZWJlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjEyIiBmaWxsPSIjYzYyODI4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+5Zu+54mH5Yqg6L295aSx6LSlPC90ZXh0Pjwvc3ZnPg==';
        imgElement.src = errorSrc;
        imgElement.removeAttribute('data-loading');
        imgElement.classList.remove('image-loading');
        imgElement.classList.add('image-error');
      };
      
      tempImg.src = assetUrl;
      
    } catch (error) {
      console.warn('获取图片路径失败:', error);
      const errorSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2ZmZWJlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjEyIiBmaWxsPSIjYzYyODI4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+5Zu+54mH5Yqg6L295aSx6LSlPC90ZXh0Pjwvc3ZnPg==';
      imgElement.src = errorSrc;
      imgElement.removeAttribute('data-loading');
      imgElement.classList.remove('image-loading');
      imgElement.classList.add('image-error');
    }
  }

  triggerImageLoad() {
    setTimeout(() => {
      if (this.lazyLoad) {
        this.lazyLoad.update();
      }
    }, 50);
  }

}
