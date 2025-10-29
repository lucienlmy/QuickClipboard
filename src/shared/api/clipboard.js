import { invoke } from '@tauri-apps/api/core'

// 获取剪贴板历史列表
export async function getClipboardHistory() {
  try {
    return await invoke('get_clipboard_history')
  } catch (error) {
    console.error('获取剪贴板历史失败:', error)
    return []
  }
}

// 粘贴剪贴板项
export async function pasteClipboardItem(clipboardId) {
  try {
    await invoke('paste_content', { 
      params: { clipboard_id: clipboardId } 
    })
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

// 获取图片文件路径
export async function getImageFilePath(content) {
  try {
    return await invoke('get_image_file_path', { content })
  } catch (error) {
    console.error('获取图片路径失败:', error)
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
export async function pinImageToScreen(filePath) {
  try {
    await invoke('pin_image_from_file', { filePath })
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
export async function openFileWithDefaultProgram(filePath) {
  try {
    await invoke('open_file_with_default_program', { filePath })
    return true
  } catch (error) {
    console.error('打开文件失败:', error)
    throw error
  }
}

// 打开文件位置
export async function openFileLocation(filePath) {
  try {
    await invoke('open_file_location', { filePath })
    return true
  } catch (error) {
    console.error('打开文件位置失败:', error)
    throw error
  }
}

