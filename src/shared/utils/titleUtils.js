// 从内容生成标题
export function generateTitleFromContent(content) {
  if (!content || content.trim() === '') {
    return '未命名项目'
  }
  
  const trimmedContent = content.trim()
  
  let title = trimmedContent.slice(0, 50)
  
  if (trimmedContent.length > 50) {
    title += '...'
  }
  
  return title
}
