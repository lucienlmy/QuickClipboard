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
export async function addFavorite(title, content, groupName = '全部') {
  const result = await invoke('add_quick_text', { title, content, groupName })
  await invoke('emit_quick_texts_updated')
  return result
}

// 更新收藏
export async function updateFavorite(id, title, content, groupName) {
  const result = await invoke('update_quick_text', { id, title, content, groupName })
  await invoke('emit_quick_texts_updated')
  return result
}

// 删除收藏
export async function deleteFavorite(id) {
  return await invoke('delete_quick_text', { id })
}

// 粘贴收藏内容
export async function pasteFavorite(id) {
  try {
    await invoke('paste_content', {
      params: { quick_text_id: id }
    })
    
    // 检查是否启用一次性粘贴
    const { getToolState } = await import('@shared/services/toolActions')
    const isOneTimePasteEnabled = getToolState('one-time-paste-button')
    
    if (isOneTimePasteEnabled) {
      try {
        await deleteFavorite(id)
        const { loadFavorites } = await import('@shared/store/favoritesStore')
        setTimeout(async () => {
          await loadFavorites()
        }, 200)
      } catch (deleteError) {
        console.error('一次性粘贴：删除收藏项失败', deleteError)
      }
    }
    
    return true
  } catch (error) {
    console.error('粘贴收藏内容失败:', error)
    throw error
  }
}

// 获取分组列表
export async function getFavoriteGroups() {
  return await invoke('get_quick_text_groups')
}

