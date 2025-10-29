// 搜索引擎选择器模块
import { showNotification } from './notificationManager.js';
import { 
  getSearchEngines, 
  getCurrentSearchEngine, 
  setCurrentSearchEngine, 
  addCustomSearchEngine,
  removeCustomSearchEngine 
} from './searchEngineManager.js';
import { showConfirmModal } from './ui.js';
import { addMultipleInputsFocusManagement } from './focus.js';

// 创建搜索引擎图标元素
function createSearchEngineIcon(engine) {
  if (engine.favicon) {
    const img = document.createElement('img');
    img.src = engine.favicon;
    img.className = 'search-engine-icon';
    
    // 如果图片加载失败，使用默认图标
    img.onerror = () => {
      const icon = document.createElement('i');
      icon.className = 'ti ti-search search-engine-icon-fallback';
      img.parentNode.replaceChild(icon, img);
    };
    
    return img;
  } else {
    const icon = document.createElement('i');
    icon.className = 'ti ti-search search-engine-icon-fallback';
    return icon;
  }
}

// 创建自定义搜索引擎对话框
export function createCustomSearchEngineDialog(callback) {
  // 移除已存在的对话框
  const existingDialog = document.querySelector('.custom-search-dialog');
  if (existingDialog) {
    existingDialog.remove();
  }
  
  // 创建对话框容器
  const dialog = document.createElement('div');
  dialog.className = 'custom-search-dialog';
  
  dialog.innerHTML = `
    <div class="dialog-header">
      <h3>添加自定义搜索引擎</h3>
    </div>
    <div class="dialog-content">
      <div class="form-group">
        <label for="engineName">搜索引擎名称</label>
        <input type="text" id="engineName" placeholder="例如：自定义搜索">
      </div>
      <div class="form-group">
        <label for="engineUrl">搜索URL (使用 %s 作为搜索词占位符)</label>
        <input type="text" id="engineUrl" placeholder="例如：https://example.com/search?q=%s">
      </div>
      <div class="form-group">
        <label for="engineFavicon">图标URL (可选，留空将自动获取)</label>
        <input type="text" id="engineFavicon" placeholder="例如：https://example.com/favicon.ico">
      </div>
      <div class="dialog-buttons">
        <button type="button" class="btn-cancel">取消</button>
        <button type="button" class="btn-confirm">添加</button>
      </div>
    </div>
  `;
  
  // 添加遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  
  const nameInput = dialog.querySelector('#engineName');
  const urlInput = dialog.querySelector('#engineUrl');
  const faviconInput = dialog.querySelector('#engineFavicon');
  const cancelBtn = dialog.querySelector('.btn-cancel');
  const confirmBtn = dialog.querySelector('.btn-confirm');
  
  // 为输入框添加焦点管理
  const inputs = [nameInput, urlInput, faviconInput];
  addMultipleInputsFocusManagement(inputs);
  
  // 取消按钮事件
  const closeDialog = () => {
    dialog.remove();
    overlay.remove();
  };
  
  cancelBtn.addEventListener('click', closeDialog);
  overlay.addEventListener('click', closeDialog);
  
  // 确认按钮事件
  confirmBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const favicon = faviconInput.value.trim();
    
    if (!name) {
      showNotification('请输入搜索引擎名称', 'error');
      return;
    }
    
    if (!url) {
      showNotification('请输入搜索URL', 'error');
      return;
    }
    
    if (!url.includes('%s')) {
      showNotification('搜索URL必须包含 %s 占位符', 'error');
      return;
    }
    
    try {
      const engine = addCustomSearchEngine({ name, url, favicon });
      callback(engine);
      closeDialog();
      showNotification(`已添加自定义搜索引擎：${name}`, 'success');
    } catch (error) {
      showNotification('添加搜索引擎失败：' + error.message, 'error');
    }
  });
  
  // 回车键确认
  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      confirmBtn.click();
    }
  };
  
  nameInput.addEventListener('keydown', handleEnter);
  urlInput.addEventListener('keydown', handleEnter);
  faviconInput.addEventListener('keydown', handleEnter);
  
  document.body.appendChild(overlay);
  document.body.appendChild(dialog);
  
  // 聚焦到第一个输入框
  setTimeout(() => {
    nameInput.focus();
  }, 0);
}

// 显示搜索引擎下拉菜单
function showSearchEngineDropdown(triggerElement, searchText, onSearch) {
  // 检查是否已存在下拉菜单
  const existingDropdown = document.querySelector('.search-engine-dropdown-menu');
  if (existingDropdown) {
    // 如果存在，直接关闭
    existingDropdown.remove();
    // 移除激活状态
    triggerElement.classList.remove('active');
    return;
  }
  
  // 添加激活状态
  triggerElement.classList.add('active');

  const dropdown = document.createElement('div');
  dropdown.className = 'search-engine-dropdown-menu';
  
  const rect = triggerElement.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 2}px`;
  dropdown.style.right = `${window.innerWidth - rect.right}px`;

  const engines = getSearchEngines();
  const currentEngine = getCurrentSearchEngine();

  // 添加搜索引擎选项
  engines.forEach(engine => {
    const item = document.createElement('div');
    item.className = `search-engine-item ${engine.id === currentEngine.id ? 'active' : ''}`;

    // 添加搜索引擎图标
    const iconElement = createSearchEngineIcon(engine);
    item.appendChild(iconElement);
    
    // 添加搜索引擎名称
    const nameSpan = document.createElement('span');
    nameSpan.className = 'engine-name';
    nameSpan.textContent = engine.name;
    item.appendChild(nameSpan);
    
    // 添加选中标记（如果是当前选中的）
    if (engine.id === currentEngine.id) {
      const checkIcon = document.createElement('i');
      checkIcon.className = 'ti ti-check check-icon';
      item.appendChild(checkIcon);
    }
    
    // 为自定义搜索引擎添加删除按钮
    if (engine.isCustom) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-engine-btn';
      deleteBtn.innerHTML = '<i class="ti ti-trash"></i>';
      deleteBtn.title = '删除搜索引擎';
      
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止触发父元素的点击事件
        
        // 使用自定义确认对话框
        showConfirmModal(
          '确认删除', 
          `确定要删除搜索引擎"${engine.name}"吗？`,
          () => {
            const success = removeCustomSearchEngine(engine.id);
            if (success) {
              showNotification(`已删除搜索引擎：${engine.name}`, 'success');
              // 关闭下拉菜单，不重新显示
              dropdown.remove();
              triggerElement.classList.remove('active');
            } else {
              showNotification('删除搜索引擎失败', 'error');
            }
          }
        );
      });
      
      item.appendChild(deleteBtn);
    }

    // 主区域点击事件（选择搜索引擎）
    item.addEventListener('click', (e) => {
      // 如果点击的是删除按钮，不执行选择逻辑
      if (e.target.closest('.delete-engine-btn')) {
        return;
      }
      
      setCurrentSearchEngine(engine.id);
      onSearch(engine.id);
      dropdown.remove();
      triggerElement.classList.remove('active');
    });

    dropdown.appendChild(item);
  });

  // 添加分隔线
  const separator = document.createElement('div');
  separator.className = 'dropdown-separator';
  dropdown.appendChild(separator);

  // 添加自定义搜索引擎选项
  const customItem = document.createElement('div');
  customItem.className = 'search-engine-item custom-item';

  customItem.innerHTML = `
    <i class="ti ti-plus"></i>
    <span class="engine-name">添加自定义搜索引擎</span>
  `;

  customItem.addEventListener('click', () => {
    dropdown.remove();
    triggerElement.classList.remove('active');
    
    createCustomSearchEngineDialog((newEngine) => {
      setCurrentSearchEngine(newEngine.id);
    });
  });

  dropdown.appendChild(customItem);
  document.body.appendChild(dropdown);

  // 点击其他地方关闭下拉菜单
  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !triggerElement.contains(e.target)) {
      dropdown.remove();
      triggerElement.classList.remove('active');
      document.removeEventListener('click', closeDropdown);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 0);

  // 调整位置确保不超出屏幕
  const dropdownRect = dropdown.getBoundingClientRect();
  
  // 垂直位置调整
  if (dropdownRect.bottom > window.innerHeight) {
    dropdown.style.top = `${rect.top - dropdownRect.height - 2}px`;
  }
  
  // 水平位置调整
  if (dropdownRect.right > window.innerWidth) {
    dropdown.style.right = '10px';
    dropdown.style.left = 'auto';
  }
  
  if (dropdownRect.left < 0) {
    dropdown.style.left = '10px';
    dropdown.style.right = 'auto';
  }
}

// 创建搜索引擎选择器
export function createSearchEngineSelector(text, onSearch) {
  const container = document.createElement('div');
  container.className = 'search-engine-selector';

  const currentEngine = getCurrentSearchEngine();
  
  // 创建主搜索区域
  const mainArea = document.createElement('div');
  mainArea.className = 'search-main-area';
  
  // 添加搜索引擎图标
  const iconElement = createSearchEngineIcon(currentEngine);
  mainArea.appendChild(iconElement);
  
  // 添加搜索文本
  const textSpan = document.createElement('span');
  textSpan.textContent = `使用${currentEngine.name}搜索`;
  mainArea.appendChild(textSpan);
  
  // 创建下拉按钮
  const dropdown = document.createElement('div');
  dropdown.className = 'search-dropdown-btn';
  dropdown.innerHTML = '<i class="ti ti-chevron-down"></i>';
  
  container.appendChild(mainArea);
  container.appendChild(dropdown);

  // 主搜索区域事件
  mainArea.addEventListener('click', (e) => {
    e.stopPropagation();
    onSearch(currentEngine.id);
  });

  // 下拉菜单事件
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    showSearchEngineDropdown(dropdown, text, onSearch);
  });

  return container;
}
