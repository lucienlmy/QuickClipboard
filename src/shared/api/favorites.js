import { invoke } from '@tauri-apps/api/core'

// 获取收藏列表
export async function getFavorites() {
  return await invoke('get_quick_texts')
}

// 按分组获取收藏
export async function getFavoritesByGroup(groupName) {
  return await invoke('get_quick_texts_by_group', { groupName })
}

// 添加收藏
export async function addFavorite(title, content, groupName = '默认') {
  return await invoke('add_quick_text', { title, content, groupName })
}

// 更新收藏
export async function updateFavorite(id, title, content, groupName) {
  return await invoke('update_quick_text', { id, title, content, groupName })
}

// 删除收藏
export async function deleteFavorite(id) {
  return await invoke('delete_quick_text', { id })
}

// 粘贴收藏内容
export async function pasteFavorite(id) {
  return await invoke('paste_content', {
    params: { quick_text_id: id }
  })
}

// 获取分组列表
export async function getFavoriteGroups() {
  return await invoke('get_quick_text_groups')
}

