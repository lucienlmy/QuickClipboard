import { invoke } from '@tauri-apps/api/core'
import { restoreLastFocus } from '@shared/api/window'

// 分页查询收藏列表
export async function getFavoritesHistory(params = {}) {
  const { offset = 0, limit = 50, groupName, search, contentType } = params

  const invokeParams = { offset, limit }
  if (groupName && groupName !== '全部') invokeParams.groupName = groupName
  if (search) invokeParams.search = search
  if (contentType) invokeParams.contentType = contentType

  return await invoke('get_favorites_history', invokeParams)
}

// 获取收藏总数
export async function getFavoritesTotalCount(groupName = null) {
  return await invoke('get_favorites_total_count', {
    groupName: groupName === '全部' ? null : groupName,
  })
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

// 移动收藏项位置（拖拽排序）
export async function moveFavoriteItemById(groupName, fromId, toId) {
  return await invoke('move_favorite_item_by_id', {
    groupName: groupName === '全部' ? null : groupName,
    fromId,
    toId,
  })
}

// 粘贴收藏内容
export async function pasteFavorite(id, format = null) {
  try {
    await restoreLastFocus()
    const params = { favorite_id: id }
    if (format) {
      params.format = format
    }

    await invoke('paste_content', { params })

    // 检查是否启用一次性粘贴
    const { getToolState } = await import('@shared/services/toolActions')
    const isOneTimePasteEnabled = getToolState('one-time-paste-button')

    if (isOneTimePasteEnabled) {
      try {
        await deleteFavorite(id)
        const { refreshFavorites } = await import('@shared/store/favoritesStore')
        setTimeout(async () => {
          await refreshFavorites()
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

