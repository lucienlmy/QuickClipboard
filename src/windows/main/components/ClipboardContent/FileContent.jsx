import { convertFileSrc } from '@tauri-apps/api/core';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';

// 图片文件扩展名
const IMAGE_FILE_EXTENSIONS = ['PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP', 'ICO', 'SVG'];

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 获取文件图标（返回真实图标或文件缩略图）
function FileIcon({
  file,
  size = 20
}) {
  const isImageFile = IMAGE_FILE_EXTENSIONS.includes(file.file_type?.toUpperCase());

  // 默认占位图标（SVG）
  const placeholderSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBmaWxsPSIjQ0NDQ0NDIi8+Cjwvc3ZnPgo=';

  // 如果是图片文件且有路径，显示缩略图预览
  if (isImageFile && file.path) {
    const iconSrc = convertFileSrc(file.path, 'asset');
    return <img src={iconSrc} alt={file.file_type || '文件'} className="flex-shrink-0 rounded-sm object-cover" style={{
      width: `${size}px`,
      height: `${size}px`
    }} loading="lazy" decoding="async" onError={e => {
      // 加载失败时显示占位图
      e.target.src = placeholderSrc;
    }} />;
  }

  // 如果有图标数据（base64），使用真实图标
  if (file.icon_data) {
    return <img src={file.icon_data} alt={file.file_type || '文件'} className="flex-shrink-0" style={{
      width: `${size}px`,
      height: `${size}px`,
      objectFit: 'contain'
    }} />;
  }

  // 默认占位图标
  return <img src={placeholderSrc} alt={file.file_type || '文件'} className="flex-shrink-0" style={{
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'contain'
  }} />;
}

// 文件内容组件
function FileContent({
  item,
  compact = false
}) {
  const settings = useSnapshot(settingsStore);
  let filesData = null;
  try {
    if (item.content?.startsWith('files:')) {
      const filesJson = item.content.substring(6);
      filesData = JSON.parse(filesJson);
    }
  } catch (error) {
    console.error('解析文件数据失败:', error);
    return <div className="text-sm text-red-500 dark:text-red-400">
      文件数据解析错误
    </div>;
  }
  if (!filesData || !filesData.files || filesData.files.length === 0) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">
      无文件信息
    </div>;
  }

  // 仅图标模式：网格布局
  if (settings.fileDisplayMode === 'iconOnly') {
    const iconSize = compact ? 29 : settings.rowHeight === 'large' || settings.rowHeight === 'auto' ? 80 : 50;
    const itemSize = compact ? 33 : settings.rowHeight === 'large' || settings.rowHeight === 'auto' ? 84 : 54;
    const gap = compact ? '0.25rem' : settings.rowHeight === 'large' || settings.rowHeight === 'auto' ? '0.5rem' : '0.375rem';
    return <div className="w-full h-full overflow-y-auto">
      <div className="w-full flex flex-wrap" style={{
        gap
      }}>
        {filesData.files.map((file, index) => <div key={index} className="flex items-center justify-center bg-white dark:bg-gray-900/50 rounded border border-gray-200/60 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 transition-colors flex-shrink-0" style={{
          width: `${itemSize}px`,
          height: `${itemSize}px`,
          padding: '2px'
        }} title={`${file.name}\n${file.path}\n${formatFileSize(file.size || 0)}`}>
          <FileIcon file={file} size={iconSize} />
        </div>)}
      </div>
    </div>;
  }

  // 小行高模式：使用紧凑样式
  if (compact) {
    return <div className="w-full h-full overflow-hidden">
      {filesData.files.map((file, index) => <div key={index} className="flex items-center gap-1 px-1 bg-white dark:bg-gray-900/50 rounded border border-gray-200/60 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 transition-colors h-full">
        <FileIcon file={file} size={24} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-xs text-gray-800 dark:text-gray-200 truncate font-medium">
              {file.name}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
              {formatFileSize(file.size || 0)}
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight">
            {file.path}
          </div>
        </div>
      </div>)}
    </div>;
  }

  // 正常模式：完整显示
  const normalIconSize = settings.rowHeight === 'large' || settings.rowHeight === 'auto' ? 48 : 36;
  return <div className="w-full h-full overflow-y-auto space-y-1 pr-1">
    {/* 文件列表 */}
    {filesData.files.map((file, index) => <div key={index} className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-gray-900/50 rounded border border-gray-200/60 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 transition-colors h-full">
      {/* 文件图标 */}
      <FileIcon file={file} size={normalIconSize} />

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-gray-800 dark:text-gray-200 truncate font-medium">
            {file.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
            {formatFileSize(file.size || 0)}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {file.path}
        </div>
      </div>
    </div>)}
  </div>;
}
export default FileContent;