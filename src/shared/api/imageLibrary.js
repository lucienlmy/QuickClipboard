import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'

// 初始化图片库目录
export async function initImageLibrary() {
  return await invoke('il_init')
}

// 保存图片
export async function saveImage(filename, data) {
  return await invoke('il_save_image', { 
    payload: { filename, data: Array.from(data) } 
  })
}

// 获取图片列表
export async function getImageList(category, offset = 0, limit = 20) {
  return await invoke('il_get_image_list', { 
    payload: { category, offset, limit } 
  })
}

// 获取图片总数
export async function getImageCount(category) {
  return await invoke('il_get_image_count', { 
    payload: { category } 
  })
}

// 删除图片
export async function deleteImage(category, filename) {
  return await invoke('il_delete_image', { 
    payload: { category, filename } 
  })
}

// 重命名图片
export async function renameImage(category, oldFilename, newFilename) {
  return await invoke('il_rename_image', { 
    payload: { category, old_filename: oldFilename, new_filename: newFilename } 
  })
}

// 获取图片目录路径
export async function getImagesDir() {
  return await invoke('il_get_images_dir')
}

// 获取 GIF 目录路径
export async function getGifsDir() {
  return await invoke('il_get_gifs_dir')
}

// 将本地路径转换为URL
export function getImageUrl(path) {
  return convertFileSrc(path)
}