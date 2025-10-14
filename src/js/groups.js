import { invoke } from '@tauri-apps/api/core';
import { setCurrentTab } from './config.js';
import { showNotification } from './notificationManager.js';
import { showConfirmModal, showAlertModal } from './ui.js';

// 分组相关的全局状态
let groups = [];
let currentGroupId = '全部';
let editingGroupName = null;
let isGroupSidebarPinned = false; // 统一侧边栏固定状态

// DOM元素引用
let groupModal;
let groupModalTitle;
let groupNameInput;
let quickTextGroupSelect;
let groupsList;

// 初始化分组功能
export async function initGroups() {
  // 获取DOM元素
  groupModal = document.querySelector('#group-modal');
  groupModalTitle = document.querySelector('#group-modal-title');
  groupNameInput = document.querySelector('#group-name');
  quickTextGroupSelect = document.querySelector('#quick-text-group');
  groupsList = document.querySelector('#groups-list');
  // 设置事件监听器
  setupGroupEventListeners();
  // 加载分组数据
  await loadGroups();
}

// 设置分组事件监听器
function setupGroupEventListeners() {
  document.getElementById('pin-group-btn').addEventListener('click', () => {
    pinGroupSidebar();
  });
  document.getElementById('add-group-btn').addEventListener('click', () => {
    showGroupModal();
  });
  // 分组模态框事件
  document.getElementById('group-modal-close-btn').addEventListener('click', hideGroupModal);
  document.getElementById('group-modal-cancel-btn').addEventListener('click', hideGroupModal);
  document.getElementById('group-modal-save-btn').addEventListener('click', saveGroup);
  // 点击遮罩关闭模态框
  groupModal.addEventListener('click', (e) => {
    if (e.target === groupModal) {
      hideGroupModal();
    }
  });
  // 键盘事件
  groupNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveGroup();
    }
  });
  // 图标网格选择事件
  setupIconGridEvents();
}

// 设置图标网格事件
function setupIconGridEvents() {
  const iconGrid = document.getElementById('group-icon-grid');
  const hiddenInput = document.getElementById('group-icon');

  if (!iconGrid || !hiddenInput) return;

  // 为每个图标选项添加点击事件
  iconGrid.addEventListener('click', (e) => {
    const iconOption = e.target.closest('.icon-option');
    if (!iconOption) return;

    // 移除所有active类
    iconGrid.querySelectorAll('.icon-option').forEach(option => {
      option.classList.remove('active');
    });

    // 添加active类到当前选中的图标
    iconOption.classList.add('active');

    // 更新隐藏输入框的值
    const iconValue = iconOption.getAttribute('data-icon');
    hiddenInput.value = iconValue;

    console.log('选中图标:', iconValue);
  });
}

// 加载分组数据
async function loadGroups() {
  try {
    const result = await invoke('get_groups');
    groups = result || [];
    
    // 确保"全部"分组始终存在并排在最前面
    const allGroupIndex = groups.findIndex(g => g.name === '全部');
    if (allGroupIndex === -1) {
      // "全部"分组不存在，添加到最前面
      groups.unshift({ name: '全部', icon: 'ti ti-list', order: -1, item_count: 0 });
    } else if (allGroupIndex !== 0) {
      // "全部"分组存在但不在第一位，移动到最前面
      const allGroup = groups.splice(allGroupIndex, 1)[0];
      allGroup.order = -1; 
      groups.unshift(allGroup);
    }
  } catch (error) {
    console.warn('后端分组功能暂未实现，使用全部分组:', error);
    // 如果后端还没有分组功能，使用全部分组
    groups = [{ name: '全部', icon: 'ti ti-list', order: 0, item_count: 0 }];
  }

  renderGroups();
  updateGroupSelects();
}

// 渲染分组列表
function renderGroups() {
  renderGroupsList(groupsList);
}

// 渲染单个分组列表
function renderGroupsList(container) {
  if (!container) return;

  container.innerHTML = '';

  groups.forEach(group => {
    const groupItem = document.createElement('div');
    groupItem.className = 'group-item';
    groupItem.dataset.groupName = group.name;

    if (group.name === currentGroupId) {
      groupItem.classList.add('active');
    }

    // 分组图标
    const iconElement = document.createElement('div');
    iconElement.className = 'group-icon';
    iconElement.innerHTML = `<i class="${group.icon}"></i>`;

    // 分组名称
    const nameElement = document.createElement('div');
    nameElement.className = 'group-name';
    nameElement.textContent = group.name;

    // 操作按钮（全部分组不显示）
    if (group.name !== '全部') {
      const actionsElement = document.createElement('div');
      actionsElement.className = 'group-actions';

      // 编辑按钮
      const editButton = document.createElement('button');
      editButton.className = 'group-action-btn edit';
      editButton.innerHTML = '<i class="ti ti-edit"></i>';
      editButton.title = '编辑分组';
      editButton.addEventListener('click', (e) => {
        e.stopPropagation();
        editGroup(group);
      });

      // 删除按钮
      const deleteButton = document.createElement('button');
      deleteButton.className = 'group-action-btn delete';
      deleteButton.innerHTML = '<i class="ti ti-trash"></i>';
      deleteButton.title = '删除分组';
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteGroup(group.name);
      });

      actionsElement.appendChild(editButton);
      actionsElement.appendChild(deleteButton);
      groupItem.appendChild(actionsElement);
    }

    // 点击事件 - 根据当前tab切换分组
    groupItem.addEventListener('click', () => {
      const activeTab = document.querySelector('.tab-button.active').dataset.tab;
      if (activeTab === 'clipboard') {
        // 剪贴板tab下切换分组时，自动切换到常用tab
        document.querySelector('[data-tab="quick-texts"]').click();
        setCurrentTab('quick-texts');
        selectGroup(group.name);
        window.dispatchEvent(new CustomEvent('groupChanged', { detail: { groupName: group.name, tab: 'quick-texts' } }));
      } else {
        // 常用tab下切换分组
        selectGroup(group.name);
        window.dispatchEvent(new CustomEvent('groupChanged', { detail: { groupName: group.name, tab: 'quick-texts' } }));
      }
    });

    // 拖拽事件
    setupGroupDropEvents(groupItem, group.name);

    groupItem.appendChild(iconElement);
    groupItem.appendChild(nameElement);
    container.appendChild(groupItem);
  });
}

// 设置分组拖拽事件
function setupGroupDropEvents(groupItem, groupName) {
  groupItem.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡
    groupItem.classList.add('drop-target');
  });

  groupItem.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡
    groupItem.classList.add('drop-target');
  });

  groupItem.addEventListener('dragleave', (e) => {
    const rect = groupItem.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      groupItem.classList.remove('drop-target');
    }
  });

  groupItem.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡
    groupItem.classList.remove('drop-target');

    try {
      // 优先尝试获取自定义MIME类型的数据
      let rawData = e.dataTransfer.getData('application/x-quickclipboard');

      // 如果自定义类型没有数据，回退到text/plain
      if (!rawData) {
        rawData = e.dataTransfer.getData('text/plain');
      }

      // console.log('拖拽原始数据:', rawData);

      if (!rawData) {
        console.warn('拖拽数据为空');
        return;
      }

      let data;
      try {
        data = JSON.parse(rawData);
      } catch (parseError) {
        console.error('拖拽数据解析失败:', parseError);
        showNotification('拖拽操作失败，数据格式错误', 'error');
        return;
      }

      if (data.type === 'clipboard') {
        try {
          // 从剪贴板历史拖拽到分组，需要先添加到常用文本
          await invoke('add_clipboard_to_group', {
            index: data.index,
            groupName: groupName
          });

          // 不切换标签页，保持在剪贴板历史列表
          // 只触发刷新事件更新分组数据
          window.dispatchEvent(new CustomEvent('refreshQuickTexts'));

          // 显示成功提示
          const targetGroup = groups.find(g => g.name === groupName);
          showNotification(`已添加到 ${targetGroup?.name || groupName}`, 'success');
        } catch (error) {
          console.error('添加到分组失败:', error);
          showNotification('添加到分组失败，请重试', 'error');
        }
      } else if (data.type === 'quicktext') {
        try {
          // 常用文本拖拽到分组
          await invoke('move_quick_text_to_group', {
            id: data.id,
            groupName: groupName
          });

          // 强制刷新当前分组的显示
          window.dispatchEvent(new CustomEvent('refreshQuickTexts'));

          // 显示成功提示
          const targetGroup = groups.find(g => g.name === groupName);
          showNotification(`已移动到 ${targetGroup?.name || groupName}`, 'success');
        } catch (error) {
          console.error('移动到分组失败:', error);
          showNotification('移动到分组失败，请重试', 'error');
        }
      }
    } catch (error) {
      console.error('拖拽到分组失败:', error);
      showAlertModal('错误', '移动到分组失败，请重试');
    }
  });
}

// 更新分组选择下拉框
function updateGroupSelects() {
  if (!quickTextGroupSelect) return;

  quickTextGroupSelect.innerHTML = '';

  groups.forEach(group => {
    const option = document.createElement('option');
    option.value = group.name;
    option.textContent = group.name;
    quickTextGroupSelect.appendChild(option);
  });
}

// 固定分组侧边栏
function pinGroupSidebar() {
  const groupsSidebar = document.getElementById('groups-sidebar');
  const pinGroupBtn = document.getElementById('pin-group-btn');
  isGroupSidebarPinned = !isGroupSidebarPinned;
  if (isGroupSidebarPinned) {
    groupsSidebar.classList.add('pinned');
    pinGroupBtn.style.backgroundColor = 'rgba(16, 143, 235, 0.3)';
    pinGroupBtn.title = '取消固定侧边栏';
    pinGroupBtn.innerHTML = '<i class="ti ti-pinned"></i>';
  } else {
    groupsSidebar.classList.remove('pinned');
    pinGroupBtn.style.backgroundColor = '';
    pinGroupBtn.title = '固定侧边栏';
    pinGroupBtn.innerHTML = '<i class="ti ti-pin"></i>';
  }
  
  // 更新侧边栏悬停行为
  import('./sidebarHover.js').then(module => {
    module.updateSidebarHoverBehavior();
  });
}

// 显示分组模态框
function showGroupModal(group = null) {
  editingGroupName = group ? group.name : null;

  if (group) {
    groupModalTitle.textContent = '编辑分组';
    groupNameInput.value = group.name;

    // 设置图标网格选中状态
    setIconGridSelection(group.icon);
  } else {
    groupModalTitle.textContent = '新增分组';
    groupNameInput.value = '';

    // 设置默认图标
    setIconGridSelection('ti ti-folder');
  }

  groupModal.classList.add('active');
  groupNameInput.focus();
}

// 设置图标网格选中状态
function setIconGridSelection(iconValue) {
  const iconGrid = document.getElementById('group-icon-grid');
  const hiddenInput = document.getElementById('group-icon');

  if (!iconGrid || !hiddenInput) return;

  // 移除所有active类
  iconGrid.querySelectorAll('.icon-option').forEach(option => {
    option.classList.remove('active');
  });

  // 找到对应的图标选项并设置为active
  const targetOption = iconGrid.querySelector(`[data-icon="${iconValue}"]`);
  if (targetOption) {
    targetOption.classList.add('active');
  }

  // 更新隐藏输入框的值
  hiddenInput.value = iconValue;
}

// 隐藏分组模态框
function hideGroupModal() {
  groupModal.classList.remove('active');
  editingGroupName = null;
}

// 编辑分组
function editGroup(group) {
  showGroupModal(group);
}

// 保存分组
async function saveGroup() {
  const name = groupNameInput.value.trim();
  const hiddenInput = document.getElementById('group-icon');
  const icon = hiddenInput ? hiddenInput.value : 'ti ti-folder';

  if (!name) {
    showAlertModal('提示', '请输入分组名称');
    return;
  }

  try {
    if (editingGroupName) {
      // 更新分组
      await invoke('update_group', {
        id: editingGroupName,
        name,
        icon
      });
      showNotification(`已更新分组 ${name}`, 'success');
    } else {
      // 新增分组
      await invoke('add_group', { name, icon });
      showNotification(`已创建分组 ${name}`, 'success');
    }

    hideGroupModal();
    await loadGroups();
  } catch (error) {
    console.error('保存分组失败:', error);
    const action = editingGroupName ? '更新' : '创建';
    showNotification(`${action}分组失败，请重试：${error}`, 'error');
  }
}

// 删除分组
function deleteGroup(groupName) {
  const group = groups.find(g => g.name === groupName);
  if (!group) return;

  showConfirmModal(
    '确认删除',
    `确定要删除分组"${group.name}"吗？分组中的内容将移动到"全部"分组。`,
    async () => {
      try {
        await invoke('delete_group', { id: groupName });

        // 如果删除的是当前选中的分组，切换到全部
        if (currentGroupId === groupName) {
          selectGroup('全部');
        }

        await loadGroups();
        // 触发刷新事件
        window.dispatchEvent(new CustomEvent('refreshQuickTexts'));

        // 显示删除成功提示
        showNotification(`已删除分组 ${group.name}`, 'success');
      } catch (error) {
        console.error('删除分组失败:', error);
        showNotification('删除分组失败，请重试', 'error');
      }
    }
  );
}

// 选择分组
function selectGroup(groupName) {
  currentGroupId = groupName;
  renderGroups();

  // 触发列表刷新
  window.dispatchEvent(new CustomEvent('groupChanged', { detail: { groupName } }));

  // 通知预览窗口分组切换
  notifyPreviewWindowGroupChange(groupName);
}

// 通知预览窗口分组切换
async function notifyPreviewWindowGroupChange(groupName) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('notify_preview_tab_change', {
      tab: 'quick-texts',
      groupName: groupName
    });
  } catch (error) {
    // 预览窗口可能未打开，忽略错误
  }
}

// 获取当前分组ID
export function getCurrentGroupId() {
  return currentGroupId;
}

// 获取所有分组
export function getGroups() {
  return groups;
}

// 导出函数供其他模块使用
export {
  updateGroupSelects,
  selectGroup
};
