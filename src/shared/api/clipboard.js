import { invoke } from '@tauri-apps/api/core'

// 获取剪贴板历史列表
export async function getClipboardHistory(params = {}) {
  try {
    const { offset = 0, limit = 50, search, contentType } = params
    
    const invokeParams = { offset, limit }
    if (search) invokeParams.search = search
    if (contentType) invokeParams.contentType = contentType
    
    return await invoke('get_clipboard_history', invokeParams)
  } catch (error) {
    console.error('获取剪贴板历史失败:', error)
    return {
      total_count: 0,
      items: [],
      offset: 0,
      limit: 50,
      has_more: false
    }
  }
}

// 获取剪贴板总数
export async function getClipboardTotalCount() {
  try {
    return await invoke('get_clipboard_total_count')
  } catch (error) {
    console.error('获取剪贴板总数失败:', error)
    return 0
  }
}

// 粘贴剪贴板项
export async function pasteClipboardItem(clipboardId, format = null) {
  try {
    const params = { clipboard_id: clipboardId }
    if (format) {
      params.format = format
    }
    
    await invoke('paste_content', { params })
    
    // 检查是否启用一次性粘贴
    const { getToolState } = await import('@shared/services/toolActions')
    const isOneTimePasteEnabled = getToolState('one-time-paste-button')
    
    if (isOneTimePasteEnabled) {
      try {
        await deleteClipboardItem(clipboardId)
        const { loadClipboardItems } = await import('@shared/store/clipboardStore')
        setTimeout(async () => {
          await loadClipboardItems()
        }, 200)
      } catch (deleteError) {
        console.error('一次性粘贴：删除失败', deleteError)
      }
    }
    
    return true
  } catch (error) {
    console.error('粘贴失败:', error)
    throw error
  }
}

// 删除剪贴板项
export async function deleteClipboardItem(id) {
  try {
    await invoke('delete_clipboard_item', { id })
    return true
  } catch (error) {
    console.error('删除剪贴板项失败:', error)
    throw error
  }
}

// 清空剪贴板历史
export async function clearClipboardHistory() {
  try {
    await invoke('clear_clipboard_history')
    return true
  } catch (error) {
    console.error('清空剪贴板历史失败:', error)
    throw error
  }
}

// 移动剪贴板项
export async function moveClipboardItem(fromIndex, toIndex) {
  try {
    await invoke('move_clipboard_item', { fromIndex, toIndex })
    return true
  } catch (error) {
    console.error('移动剪贴板项失败:', error)
    throw error
  }
}

// 添加到常用文本
export async function addToFavorites(id) {
  try {
    await invoke('add_clipboard_to_favorites', { id })
    await invoke('emit_quick_texts_updated')
    return true
  } catch (error) {
    console.error('添加到常用文本失败:', error)
    throw error
  }
}


// 检查文件是否存在
export async function checkFileExists(path) {
  try {
    return await invoke('file_exists', { path })
  } catch (error) {
    console.warn(`检查文件是否存在失败: ${path}`, error)
    return false
  }
}

// 打开文本编辑器
export async function openTextEditor() {
  try {
    await invoke('open_text_editor_window')
    return true
  } catch (error) {
    console.error('打开文本编辑器失败:', error)
    throw error
  }
}

// 钉图片到屏幕
export async function pinImageToScreen(clipboardId) {
  try {
    await invoke('pin_image_to_screen', { clipboardId })
    return true
  } catch (error) {
    console.error('钉图到屏幕失败:', error)
    throw error
  }
}

// 保存图片到文件
export async function saveImageToFile(content, filePath) {
  try {
    await invoke('save_image_to_file', { content, filePath })
    return true
  } catch (error) {
    console.error('保存图片失败:', error)
    throw error
  }
}

// 使用默认程序打开文件
export async function openFileWithDefaultProgram(clipboardId) {
  try {
    await invoke('open_file_with_default_program', { clipboardId })
    return true
  } catch (error) {
    console.error('打开文件失败:', error)
    throw error
  }
}

// 打开文件位置
export async function openFileLocation(clipboardId) {
  try {
    await invoke('open_file_location', { clipboardId })
    return true
  } catch (error) {
    console.error('打开文件位置失败:', error)
    throw error
  }
}

// 获取单个剪贴板项
export async function getClipboardItemById(id) {
  return await invoke('get_clipboard_item_by_id_cmd', { id })
}

// 更新剪贴板项
export async function updateClipboardItem(id, content) {
  await invoke('update_clipboard_item_cmd', { id, content })
  await invoke('emit_clipboard_updated')
}

// 获取单个收藏项
export async function getFavoriteItemById(id) {
  return await invoke('get_favorite_item_by_id_cmd', { id })
}

// 添加剪贴板项到收藏
export async function addClipboardToFavorites(id, groupName) {
  await invoke('add_clipboard_to_favorites', { id, groupName })
  await invoke('emit_quick_texts_updated')
}

// 保存剪贴板图片
export async function saveImageFromClipboard(clipboardId) {
  return await invoke('save_image_from_clipboard', { clipboardId })
}

// 复制文件路径
export async function copyFilePaths(clipboardId) {
  return await invoke('copy_file_paths', { clipboardId })
}

