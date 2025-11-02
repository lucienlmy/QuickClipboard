import { invoke } from '@tauri-apps/api/core'

// 获取所有分组
export async function getGroups() {
  return await invoke('get_groups')
}

// 添加分组
export async function addGroup(name, icon = 'ti ti-folder') {
  return await invoke('add_group', { name, icon })
}

// 更新分组
export async function updateGroup(oldName, newName, newIcon) {
  return await invoke('update_group', { 
    oldName, 
    newName, 
    newIcon 
  })
}

// 删除分组
export async function deleteGroup(name) {
  return await invoke('delete_group', { name })
}

// 移动收藏项到分组
export async function moveFavoriteToGroup(id, groupName) {
  return await invoke('move_quick_text_to_group', { id, groupName })
}

// 从剪贴板添加到分组
export async function addClipboardToGroup(index, groupName) {
  return await invoke('add_clipboard_to_group', { index, groupName })
}

