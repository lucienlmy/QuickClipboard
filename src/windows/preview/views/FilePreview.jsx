import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Virtuoso } from 'react-virtuoso';
import { formatFileSize } from '@shared/utils/format';

function getFileIconClass(file) {
  if (file?.isDirectory) {
    return 'ti ti-folder';
  }

  if (file?.fileType && /^(png|jpe?g|gif|bmp|webp|ico|svg)$/i.test(file.fileType)) {
    return 'ti ti-photo';
  }

  if (file?.exists === false) {
    return 'ti ti-file-off';
  }

  return 'ti ti-file';
}

function FileIcon({ file, size = 28 }) {
  const isImageFile = file?.fileType && /^(png|jpe?g|gif|bmp|webp|ico|svg)$/i.test(file.fileType);
  const actualPath = file?.actualPath || file?.path || '';
  const placeholderSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIGZpbGw9IiNDQ0NDQ0MiLz48L3N2Zz4K';

  if (file?.exists === false) {
    return (
      <span className="flex items-center justify-center text-qc-fg-muted">
        <i className="ti ti-file-off" style={{ fontSize: Math.max(14, Math.round(size * 0.55)) }} />
      </span>
    );
  }

  if (isImageFile && actualPath) {
    return (
      <img
        src={convertFileSrc(actualPath, 'asset')}
        alt={file?.name || '文件'}
        className="flex-shrink-0 rounded-sm object-cover"
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          e.currentTarget.src = placeholderSrc;
        }}
      />
    );
  }

  if (file?.iconData) {
    return (
      <img
        src={file.iconData}
        alt={file?.name || '文件'}
        className="flex-shrink-0"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
        }}
      />
    );
  }

  return (
    <span className="flex items-center justify-center text-qc-fg-subtle">
      <i className={getFileIconClass(file)} style={{ fontSize: Math.max(14, Math.round(size * 0.55)) }} />
    </span>
  );
}

function MarqueeText({ text, className = '', title, textClassName = '' }) {
  const outerRef = useRef(null);
  const contentRef = useRef(null);
  const [shouldMarquee, setShouldMarquee] = useState(false);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) {
      return undefined;
    }

    let rafId = 0;
    let observer = null;

    const measure = () => {
      rafId = requestAnimationFrame(() => {
        const outerWidth = outer.clientWidth || 0;
        const contentWidth = content.scrollWidth || 0;
        setShouldMarquee(contentWidth > outerWidth + 2);
      });
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(outer);
      observer.observe(content);
    } else {
      window.addEventListener('resize', measure);
    }

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', measure);
      }
    };
  }, [text]);

  if (!text) {
    return <span className={textClassName} title={title || ''} />;
  }

  if (!shouldMarquee) {
    return (
      <span ref={outerRef} className={`block min-w-0 ${className}`} title={title || text}>
        <span className={`block truncate ${textClassName}`} ref={contentRef}>
          {text}
        </span>
      </span>
    );
  }

  return (
    <span ref={outerRef} className={`qc-file-marquee block min-w-0 overflow-hidden ${className}`} title={title || text}>
      <span ref={contentRef} className="inline-flex w-max items-center whitespace-nowrap">
        <span className={textClassName}>{text}</span>
        <span aria-hidden="true" className={`ml-8 ${textClassName}`}>
          {text}
        </span>
      </span>
    </span>
  );
}

const FILE_ROW_MIN_WIDTH = 700;
const FILE_GRID_TEMPLATE = 'grid-cols-[minmax(0,1.7fr)_88px_72px_minmax(0,2.1fr)_92px]';

const FilePreviewList = forwardRef(function FilePreviewList(props, ref) {
  return (
    <div
      ref={ref}
      {...props}
      style={{
        ...(props.style || {}),
        minWidth: `${FILE_ROW_MIN_WIDTH}px`,
      }}
      className={`${props.className || ''} pr-1`}
    />
  );
});

function FileTableHeader({ t }) {
  return (
    <div
      className={`grid ${FILE_GRID_TEMPLATE} gap-2 border-b border-qc-border/70 bg-qc-panel/90 px-3 py-2 text-[11px] font-medium tracking-wide text-qc-fg-subtle backdrop-blur-md`}
      style={{ minWidth: `${FILE_ROW_MIN_WIDTH}px` }}
    >
      <div className="min-w-0 flex items-center justify-center text-center">
        {t('previewWindow.fileHeaderName', '名称')}
      </div>
      <div className="flex items-center justify-center text-center">
        {t('previewWindow.fileHeaderSize', '大小')}
      </div>
      <div className="flex items-center justify-center text-center">
        {t('previewWindow.fileHeaderType', '类型')}
      </div>
      <div className="min-w-0 flex items-center justify-center text-center">
        {t('previewWindow.fileHeaderPath', '路径')}
      </div>
      <div className="flex items-center justify-center text-center">
        {t('previewWindow.fileHeaderStatus', '状态')}
      </div>
    </div>
  );
}

function getStatusLabel(file, t) {
  if (file?.exists === false) {
    return t('previewWindow.fileStatusMissing', '文件不存在');
  }

  if (file?.isDirectory) {
    return t('previewWindow.fileStatusDirectory', '目录');
  }

  return t('previewWindow.fileStatusReady', '可用');
}

function getTypeLabel(file, t) {
  if (file?.isDirectory) {
    return t('previewWindow.fileTypeDirectory', '目录');
  }

  if (file?.fileType) {
    return String(file.fileType).toUpperCase();
  }

  return t('previewWindow.fileTypeUnknown', '文件');
}

function getDetailText(file, t) {
  const width = Number(file?.width);
  const height = Number(file?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return `${width} × ${height}`;
  }

  if (file?.isDirectory) {
    return t('previewWindow.fileExtraDirectory', '目录项');
  }

  return '';
}

const FilePreview = forwardRef(function FilePreview(
  {
    files = [],
    stats = null,
    t,
  },
  ref,
) {
  const scrollerElementRef = useRef(null);
  const setScrollerElement = useCallback((element) => {
    scrollerElementRef.current = element || null;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollBy(delta) {
        scrollerElementRef.current?.scrollBy({ top: delta, behavior: 'auto' });
      },
    }),
    [],
  );

  if (!Array.isArray(files) || files.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center px-4 py-3 text-sm text-qc-fg-muted">
        {t('previewWindow.fileEmpty', '没有可预览的文件')}
      </div>
    );
  }

  const totalSize = Number(stats?.totalSize) || 0;
  const fileCount = Number(stats?.fileCount) || files.length || 0;
  const directoryCount = Number(stats?.directoryCount) || 0;
  const missingCount = Number(stats?.missingCount) || 0;
  const defaultItemHeight = 86;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <style>{`
        @keyframes qc-preview-file-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .qc-file-marquee > span {
          animation: qc-preview-file-marquee 12s linear infinite;
          will-change: transform;
        }

        .qc-file-marquee:hover > span {
          animation-play-state: paused;
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-qc-border/70 bg-qc-panel/80 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md border border-qc-border bg-qc-panel/70 px-2 py-1 text-[11px] leading-4 text-qc-fg-subtle">
            {t('previewWindow.fileSummaryCount', '共 {{count}} 项', { count: fileCount })}
          </div>
          <div className="rounded-md border border-qc-border bg-qc-panel/70 px-2 py-1 text-[11px] leading-4 text-qc-fg-subtle">
            {t('previewWindow.fileSummarySize', '总大小 {{size}}', { size: formatFileSize(totalSize) })}
          </div>
          <div className="rounded-md border border-qc-border bg-qc-panel/70 px-2 py-1 text-[11px] leading-4 text-qc-fg-subtle">
            {t('previewWindow.fileSummaryDirectory', '目录 {{count}}', { count: directoryCount })}
          </div>
          <div className="rounded-md border border-qc-border bg-qc-panel/70 px-2 py-1 text-[11px] leading-4 text-qc-fg-subtle">
            {t('previewWindow.fileSummaryMissing', '缺失 {{count}}', { count: missingCount })}
          </div>
        </div>
      </div>

      <FileTableHeader t={t} />

      <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
        <Virtuoso
          totalCount={files.length}
          data={files}
          scrollerRef={setScrollerElement}
          defaultItemHeight={defaultItemHeight}
          increaseViewportBy={{ top: 240, bottom: 320 }}
          overscan={8}
          computeItemKey={(index) => {
            const file = files[index];
            return file?.actualPath || file?.path || file?.name || `file-${index}`;
          }}
          style={{ height: '100%' }}
          className="h-full custom-scrollbar-container"
          components={{
            List: FilePreviewList,
          }}
          itemContent={(index, file) => {
            const statusLabel = getStatusLabel(file, t);
            const typeLabel = getTypeLabel(file, t);
            const detailText = getDetailText(file, t);
            const displayPath = file?.displayPath || file?.actualPath || file?.path || '';
            const storedPath = file?.path || '';
            const pathMismatch = Boolean(file?.actualPath && storedPath && file.actualPath !== storedPath);
            const sizeLabel = file?.isDirectory
              ? t('previewWindow.fileSizeDirectory', '目录')
              : formatFileSize(Number(file?.size) || 0);
            const nameTextClass = file?.exists === false ? 'text-qc-fg-muted line-through' : 'text-qc-fg';
            const pathTextClass = 'text-qc-fg';

            return (
              <div className="w-full pb-2" style={{ minWidth: `${FILE_ROW_MIN_WIDTH}px` }}>
                <div
                  className={`grid ${FILE_GRID_TEMPLATE} gap-2 rounded-lg border px-3 py-2 transition-colors ${
                    file?.exists === false
                      ? 'border-qc-border bg-qc-active/20'
                      : 'border-qc-border bg-qc-panel/65 hover:bg-qc-hover/70'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center justify-center gap-2 text-center">
                      <span
                        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-qc-border bg-qc-surface/80 text-qc-fg-subtle ${
                          file?.exists === false ? 'opacity-70' : ''
                        }`}
                      >
                        <FileIcon file={file} size={28} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <MarqueeText
                          text={file?.name || t('previewWindow.fileUnknownName', '未命名文件')}
                          title={file?.name || ''}
                          className="min-w-0"
                          textClassName={`text-sm font-medium text-center ${nameTextClass}`}
                        />
                        {detailText && (
                          <div className="mt-0.5 text-xs text-qc-fg-muted text-center">
                            {detailText}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    <span className="text-sm text-qc-fg tabular-nums text-center">
                      {sizeLabel}
                    </span>
                  </div>

                  <div className="min-w-0 flex items-start justify-center">
                    <span className="inline-flex max-w-full items-center rounded-md border border-qc-border bg-qc-panel/70 px-2 py-1 text-xs font-medium text-qc-fg-subtle">
                      {typeLabel}
                    </span>
                  </div>

                  <div className="min-w-0 text-center">
                    <MarqueeText
                      text={displayPath || t('previewWindow.fileNoPath', '无路径信息')}
                      title={displayPath}
                      className="min-w-0"
                      textClassName={`text-sm text-center ${pathTextClass}`}
                    />
                    {pathMismatch && (
                      <MarqueeText
                        text={t('previewWindow.fileStoredPath', '存储路径：{{path}}', { path: storedPath })}
                        title={storedPath}
                        className="mt-0.5 min-w-0"
                        textClassName="text-xs text-qc-fg-muted text-center"
                      />
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center gap-1 text-center">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 ${
                        file?.exists === false
                          ? 'border-qc-border bg-qc-active/20 text-qc-fg'
                          : 'border-qc-border bg-qc-panel/80 text-qc-fg-subtle'
                      }`}
                    >
                      {statusLabel}
                    </span>
                    {file?.isDirectory && (
                      <span className="text-[10px] leading-4 text-qc-fg-muted">
                        {t('previewWindow.fileExtraDirectory', '目录项')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
});

export default FilePreview;
