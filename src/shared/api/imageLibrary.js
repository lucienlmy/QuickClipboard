import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'

async function uint8ArrayToNumberArrayChunked(data, chunkSize = 256 * 1024) {
  if (!data) return []
  if (Array.isArray(data)) return data
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  const result = new Array(u8.length)
  for (let offset = 0; offset < u8.length; offset += chunkSize) {
    const end = Math.min(u8.length, offset + chunkSize)
    for (let i = offset; i < end; i++) {
      result[i] = u8[i]
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return result
}

// 初始化图片库目录
export async function initImageLibrary() {
  return await invoke('il_init')
}

// 保存图片
export async function saveImage(filename, data) {
  const payloadData = await uint8ArrayToNumberArrayChunked(data)
  return await invoke('il_save_image', { 
    payload: { filename, data: payloadData } 
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