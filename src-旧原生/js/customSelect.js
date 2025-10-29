/**
 * 自定义下拉选择组件 - 支持二级菜单和行高管理
 */

export class CustomSelect {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options.options || [];
    this.value = options.value || '';
    this.placeholder = options.placeholder || '请选择';
    this.onChange = options.onChange || (() => { });
    this.enableHover = options.enableHover !== false; // 默认启用悬停
    this.isMenuType = options.isMenuType || false; // 是否为菜单类型（支持二级菜单）

    this.isOpen = false;
    this.selectedIndex = -1;
    this.activeSubMenu = null;
    this.hoverTimeout = null;
    this.currentRowHeight = null;

    this.init();
    this.initRowHeightManager();
  }

  init() {
    this.render();
    this.bindEvents();
    this.updateSelected();
    
    // 如果是菜单类型，监听筛选状态变化
    if (this.isMenuType) {
      this.bindFilterChangeListener();
      
      // 延迟更新以确保DOM完全就绪和容器正确识别
      setTimeout(() => {
        this.updateSelected();
      }, 100);
    }
  }

  initRowHeightManager() {
    // 初始化行高管理器
    this.currentRowHeight = localStorage.getItem('app-row-height') || 'medium';
    this.applyRowHeightClass(this.currentRowHeight);
    
    // 初始化文件样式管理器
    this.currentFileStyle = localStorage.getItem('app-file-style') || 'detailed';
    this.applyFileStyleClass(this.currentFileStyle);
  }
  
  applyFileStyleClass(style) {
    const body = document.body;
    body.classList.remove('file-style-detailed', 'file-style-icons-only');
    body.classList.add(`file-style-${style}`);
    this.currentFileStyle = style;
    localStorage.setItem('app-file-style', style);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('file-style-changed', { detail: { style } }));
    }, 50);
  }

  applyRowHeightClass(size) {
    const body = document.body;
    body.classList.remove('row-height-small', 'row-height-medium', 'row-height-large');
    body.classList.add(`row-height-${size}`);
    this.currentRowHeight = size;
    localStorage.setItem('app-row-height', size);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('row-height-changed', { detail: { size } }));
    }, 50);
  }

  render() {
    if (this.isMenuType) {
      this.renderMenu();
    } else {
      this.renderSelect();
    }
  }

  renderMenu() {
    this.container.innerHTML = `
      <div class="custom-menu">
        <div class="custom-menu-trigger">
          <span class="custom-menu-icon"><i class="ti ti-menu-2"></i></span>
        </div>
        <div class="custom-menu-dropdown">
          ${this.renderMenuItems()}
        </div>
      </div>
    `;

    this.trigger = this.container.querySelector('.custom-menu-trigger');
    this.dropdown = this.container.querySelector('.custom-menu-dropdown');
    this.iconElement = this.container.querySelector('.custom-menu-icon');
  }

  renderMenuItems() {
    return this.options.map((option, index) => {
      if (option.children && option.children.length > 0) {
        return `
          <div class="custom-menu-item has-submenu" data-value="${option.value}" data-index="${index}">
            <span class="menu-item-text">${option.text}</span>
            <span class="menu-item-arrow"><i class="ti ti-chevron-left"></i></span>
            <div class="custom-submenu">
              ${option.children.map((child, childIndex) => {
                const isSelected = this.isChildSelected(child.value);
                return `
                  <div class="custom-submenu-item ${isSelected ? 'selected' : ''}" data-value="${child.value}" data-parent="${option.value}" data-index="${childIndex}">
                    ${child.text}
                    ${isSelected ? '<span class="selected-indicator"><i class="ti ti-check"></i></span>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      } else {
        return `
          <div class="custom-menu-item" data-value="${option.value}" data-index="${index}">
            <span class="menu-item-text">${option.text}</span>
          </div>
        `;
      }
    }).join('');
  }

  renderSelect() {
    this.container.innerHTML = `
      <div class="custom-select">
        <div class="custom-select-trigger">
          <span class="custom-select-text">${this.placeholder}</span>
          <span class="custom-select-arrow"><i class="ti ti-chevron-down"></i></span>
        </div>
        <div class="custom-select-dropdown">
          ${this.options.map((option, index) => `
            <div class="custom-select-option" data-value="${option.value}" data-index="${index}">
              ${option.text}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.trigger = this.container.querySelector('.custom-select-trigger');
    this.dropdown = this.container.querySelector('.custom-select-dropdown');
    this.textElement = this.container.querySelector('.custom-select-text');
    this.optionElements = this.container.querySelectorAll('.custom-select-option');
  }

  bindEvents() {
    if (this.isMenuType) {
      this.bindMenuEvents();
    } else {
      this.bindSelectEvents();
    }

    // 点击外部关闭下拉
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.close();
      }
    });

    // 使触发器可聚焦
    this.trigger.setAttribute('tabindex', '0');
  }

  bindMenuEvents() {
    // 点击触发器切换下拉状态
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // 悬停触发器打开菜单
    if (this.enableHover) {
      this.trigger.addEventListener('mouseenter', () => {
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
        }
        this.hoverTimeout = setTimeout(() => {
          this.open();
        }, 100);
      });

      this.trigger.addEventListener('mouseleave', () => {
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
        }
        this.hoverTimeout = setTimeout(() => {
          if (!this.dropdown.matches(':hover')) {
            this.close();
          }
        }, 200);
      });

      this.dropdown.addEventListener('mouseenter', () => {
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
        }
      });

      this.dropdown.addEventListener('mouseleave', () => {
        this.hoverTimeout = setTimeout(() => {
          this.close();
        }, 200);
      });
    }

    // 绑定菜单项事件
    this.bindMenuItemEvents();
  }

  bindMenuItemEvents() {
    // 菜单项事件
    const menuItems = this.container.querySelectorAll('.custom-menu-item');
    menuItems.forEach(item => {
      const hasSubmenu = item.classList.contains('has-submenu');
      
      if (hasSubmenu) {
        // 悬停显示子菜单
        item.addEventListener('mouseenter', () => {
          this.showSubMenu(item);
        });
        
        item.addEventListener('mouseleave', () => {
          // 延迟隐藏子菜单
          setTimeout(() => {
            const submenu = item.querySelector('.custom-submenu');
            if (!submenu.matches(':hover')) {
              this.hideSubMenu(item);
            }
          }, 100);
        });

        // 子菜单项点击
        const submenuItems = item.querySelectorAll('.custom-submenu-item');
        submenuItems.forEach(subItem => {
          subItem.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = subItem.dataset.value;
            this.handleMenuItemClick(value, subItem.textContent.trim());
          });
        });
      } else {
        // 普通菜单项点击
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = item.dataset.value;
          this.handleMenuItemClick(value, item.textContent.trim());
        });
      }
    });
  }

  bindSelectEvents() {
    // 点击触发器切换下拉状态
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // 悬停触发器打开选择器
    if (this.enableHover) {
      this.trigger.addEventListener('mouseenter', () => {
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
        }
        this.hoverTimeout = setTimeout(() => {
          this.open();
        }, 100);
      });

      this.trigger.addEventListener('mouseleave', () => {
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
        }
        this.hoverTimeout = setTimeout(() => {
          if (!this.dropdown.matches(':hover')) {
            this.close();
          }
        }, 200);
      });

      this.dropdown.addEventListener('mouseleave', () => {
        this.hoverTimeout = setTimeout(() => {
          this.close();
        }, 200);
      });
    }

    // 点击选项
    this.optionElements.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value;
        const index = parseInt(option.dataset.index);
        this.select(value, index);
      });
    });

    // 键盘导航
    this.container.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });
  }

  handleKeydown(e) {
    if (this.isMenuType) return; // 菜单类型不使用键盘导航
    
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this.isOpen) {
          if (this.selectedIndex >= 0) {
            const option = this.options[this.selectedIndex];
            this.select(option.value, this.selectedIndex);
          }
        } else {
          this.open();
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.close();
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (!this.isOpen) {
          this.open();
        } else {
          this.navigateDown();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (this.isOpen) {
          this.navigateUp();
        }
        break;
    }
  }

  navigateDown() {
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.options.length - 1);
    this.updateHighlight();
  }

  navigateUp() {
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.updateHighlight();
  }

  updateHighlight() {
    if (this.optionElements) {
      this.optionElements.forEach((option, index) => {
        option.classList.toggle('highlighted', index === this.selectedIndex);
      });
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.trigger.classList.add('active');
    this.dropdown.classList.add('active');

    // 如果是菜单类型，改变图标
    if (this.isMenuType && this.iconElement) {
      const icon = this.iconElement.querySelector('i');
      if (icon && icon.classList.contains('ti-menu-2')) {
        icon.classList.remove('ti-menu-2');
        icon.classList.add('ti-menu-deep');
      }
    }

    if (!this.isMenuType) {
      // 设置当前选中项的高亮
      const currentIndex = this.options.findIndex(option => option.value === this.value);
      this.selectedIndex = currentIndex >= 0 ? currentIndex : 0;
      this.updateHighlight();
    }
  }

  close() {
    this.isOpen = false;
    this.trigger.classList.remove('active');
    this.dropdown.classList.remove('active');

    // 如果是菜单类型，恢复图标
    if (this.isMenuType && this.iconElement) {
      const icon = this.iconElement.querySelector('i');
      if (icon && icon.classList.contains('ti-menu-deep')) {
        icon.classList.remove('ti-menu-deep');
        icon.classList.add('ti-menu-2');
      }
    }

    this.selectedIndex = -1;
    this.updateHighlight();
    this.hideAllSubMenus();
  }

  showSubMenu(menuItem) {
    // 隐藏其他子菜单
    this.hideAllSubMenus();
    
    // 显示当前子菜单
    const submenu = menuItem.querySelector('.custom-submenu');
    if (submenu) {
      submenu.classList.add('active');
      this.activeSubMenu = submenu;
    }
  }

  hideSubMenu(menuItem) {
    const submenu = menuItem.querySelector('.custom-submenu');
    if (submenu) {
      submenu.classList.remove('active');
      if (this.activeSubMenu === submenu) {
        this.activeSubMenu = null;
      }
    }
  }

  hideAllSubMenus() {
    const allSubmenus = this.container.querySelectorAll('.custom-submenu');
    allSubmenus.forEach(submenu => {
      submenu.classList.remove('active');
    });
    this.activeSubMenu = null;
  }

  // 检查子选项是否被选中
  isChildSelected(childValue) {
    // 对于行高选项，检查是否与当前行高设置匹配
    if (childValue.startsWith('row-height-')) {
      const currentRowHeight = localStorage.getItem('app-row-height') || 'medium';
      return childValue === `row-height-${currentRowHeight}`;
    }
    
    // 对于文件样式选项，检查是否与当前文件样式设置匹配
    if (childValue.startsWith('file-style-')) {
      const currentFileStyle = localStorage.getItem('app-file-style') || 'detailed';
      return childValue === `file-style-${currentFileStyle}`;
    }
    
    // 对于筛选选项，需要从config中获取当前筛选值
    if (['all', 'text', 'image', 'file', 'link'].includes(childValue)) {
      try {
        // 根据容器ID判断是剪贴板还是常用文本筛选器
        const isClipboard = this.container.closest('#content-filter');
        const isQuickTexts = this.container.closest('#quick-texts-filter');
        
        if (isClipboard) {
          // 获取剪贴板当前筛选值，如果没有则设置默认值
          let currentFilter = localStorage.getItem('clipboard-current-filter');
          if (!currentFilter) {
            currentFilter = 'all';
            localStorage.setItem('clipboard-current-filter', 'all');
          }
          return childValue === currentFilter;
        } else if (isQuickTexts) {
          // 获取常用文本当前筛选值，如果没有则设置默认值
          let currentFilter = localStorage.getItem('quicktexts-current-filter');
          if (!currentFilter) {
            currentFilter = 'all';
            localStorage.setItem('quicktexts-current-filter', 'all');
          }
          return childValue === currentFilter;
        }
      } catch (e) {
        console.warn('获取筛选状态失败:', e);
      }
      
      // 如果无法确定容器类型，默认 'all' 选项被选中
      return childValue === 'all';
    }
    
    // 对于其他选项，检查是否与当前值匹配
    return this.value === childValue;
  }

  handleMenuItemClick(value, text) {
    // 处理特殊的行高选项
    if (value === 'row-height-large' || value === 'row-height-medium' || value === 'row-height-small') {
      const size = value.replace('row-height-', '');
      this.applyRowHeightClass(size);
    }
    
    // 处理文件样式选项
    if (value === 'file-style-detailed' || value === 'file-style-icons-only') {
      const style = value.replace('file-style-', '');
      this.applyFileStyleClass(style);
    }
    
    this.value = value;
    // 不更新文本，保持图标显示
    this.close();
    this.onChange(value, text);
    
    // 延迟重新渲染以更新高亮状态
    setTimeout(() => {
      this.updateSelected();
    }, 50);
  }

  select(value, index) {
    this.value = value;
    this.updateSelected();
    this.close();
    this.onChange(value);
  }

  updateSelected() {
    if (this.isMenuType) {
      // 菜单模式不更新文本，保持图标显示
      // 重新渲染以更新选中状态
      const menuDropdown = this.dropdown;
      if (menuDropdown) {
        menuDropdown.innerHTML = this.renderMenuItems();
        // 重新绑定菜单事件
        this.bindMenuItemEvents();
      }
    } else {
      // 选择器模式正常更新文本
      const selectedOption = this.options.find(option => option.value === this.value);
      if (selectedOption && this.textElement) {
        this.textElement.textContent = selectedOption.text;
      } else if (this.textElement) {
        this.textElement.textContent = this.placeholder;
      }

      // 更新选中状态
      if (this.optionElements) {
        this.optionElements.forEach(option => {
          option.classList.toggle('selected', option.dataset.value === this.value);
        });
      }
    }
  }

  setValue(value) {
    this.value = value;
    this.updateSelected();
  }

  getValue() {
    return this.value;
  }

  setOptions(options) {
    this.options = options;
    this.render();
    this.bindEvents();
    this.updateSelected();
  }

  // 绑定筛选变化监听器
  bindFilterChangeListener() {
    this.filterChangeHandler = () => {
      // 当筛选状态改变时，重新渲染以更新高亮状态
      if (this.isMenuType) {
        setTimeout(() => {
          this.updateSelected();
        }, 50);
      }
    };
    
    // 行高变化监听器
    this.rowHeightChangeHandler = () => {
      // 当行高改变时，更新高亮状态
      if (this.isMenuType) {
        setTimeout(() => {
          this.updateSelected();
        }, 50);
      }
    };
    
    // 监听localStorage变化
    window.addEventListener('storage', this.filterChangeHandler);
    
    // 监听自定义筛选变化事件
    window.addEventListener('filter-changed', this.filterChangeHandler);
    
    // 监听行高变化事件
    window.addEventListener('row-height-changed', this.rowHeightChangeHandler);
  }

  destroy() {
    // 清理定时器
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
    
    // 清理筛选变化监听器
    if (this.filterChangeHandler) {
      window.removeEventListener('storage', this.filterChangeHandler);
      window.removeEventListener('filter-changed', this.filterChangeHandler);
    }
    
    // 清理行高变化监听器
    if (this.rowHeightChangeHandler) {
      window.removeEventListener('row-height-changed', this.rowHeightChangeHandler);
    }
    
    // 清理事件监听器
    document.removeEventListener('click', this.documentClickHandler);
    this.container.innerHTML = '';
  }
}
