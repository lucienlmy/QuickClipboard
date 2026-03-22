import { getPrimaryType } from '@shared/utils/contentType';

export const MODE_TEXT = 'text';
export const MODE_HTML = 'html';
export const MODE_IMAGE = 'image';

export const PREVIEW_OFFSET = 14;
export const TEXT_SCROLL_STEP = 120;
export const IMAGE_SCALE_STEP = 0.1;
export const IMAGE_SCALE_MIN = 1;
export const IMAGE_SCALE_MAX = 5;
export const IMAGE_SCALE_INDICATOR_DURATION = 1500;
export const TEXT_MIN_HEIGHT = 46;
export const TEXT_DEFAULT_HEIGHT = 46;
export const IMAGE_STATUS_IDLE = 'idle';
export const IMAGE_STATUS_LOADING = 'loading';
export const IMAGE_STATUS_READY = 'ready';
export const IMAGE_STATUS_ERROR = 'error';

export const isFiniteNumber = (value) => Number.isFinite(value) && !Number.isNaN(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const roundSize = (value, minValue = 120) => Math.max(minValue, Math.round(value));

export function resolvePreviewMode(requestedMode, item) {
  const primaryType = getPrimaryType(item?.content_type);

  if (requestedMode === MODE_IMAGE || primaryType === 'image') {
    return MODE_IMAGE;
  }

  if (
    requestedMode === MODE_HTML ||
    (primaryType === 'rich_text' && typeof item?.html_content === 'string' && item.html_content.trim().length > 0)
  ) {
    return MODE_HTML;
  }

  return MODE_TEXT;
}

export function resolveBoxSize(mode, workAreaHeight, workAreaWidth, options = {}) {
  if (!isFiniteNumber(workAreaHeight) || workAreaHeight <= 0) {
    return { width: 420, height: 560 };
  }

  if (mode === MODE_IMAGE) {
    const maxEdge = clamp(
      roundSize(workAreaHeight * 0.5, 180),
      180,
      Math.max(180, Math.min(workAreaWidth - 24, workAreaHeight - 24)),
    );
    const imageWidth = Number(options.imageWidth);
    const imageHeight = Number(options.imageHeight);
    if (isFiniteNumber(imageWidth) && imageWidth > 0 && isFiniteNumber(imageHeight) && imageHeight > 0) {
      const scale = Math.min(maxEdge / imageWidth, maxEdge / imageHeight);
      const width = clamp(roundSize(imageWidth * scale, 120), 120, Math.max(120, workAreaWidth - 24));
      const height = clamp(roundSize(imageHeight * scale, 120), 120, Math.max(120, workAreaHeight - 24));
      return { width, height };
    }

    return { width: maxEdge, height: maxEdge };
  }

  if (mode === MODE_HTML) {
    const preferredWidth = Number(options.htmlWidth);
    const preferredHeight = Number(options.htmlHeight);
    const baseWidth = clamp(
      roundSize(workAreaHeight * 0.5, 260),
      260,
      Math.max(260, workAreaWidth - 24),
    );
    const maxHeight = clamp(
      roundSize(workAreaHeight * (2 / 3), 300),
      300,
      Math.max(300, workAreaHeight - 24),
    );

    const width = isFiniteNumber(preferredWidth) && preferredWidth > 0
      ? Math.round(preferredWidth)
      : baseWidth;
    const height = isFiniteNumber(preferredHeight) && preferredHeight > 0
      ? Math.round(preferredHeight)
      : TEXT_DEFAULT_HEIGHT;

    return {
      width: clamp(width, 260, baseWidth),
      height: clamp(height, TEXT_MIN_HEIGHT, maxHeight),
    };
  }

  const width = roundSize(workAreaHeight * 0.5, 260);
  const maxHeight = clamp(
    roundSize(workAreaHeight * (2 / 3), 300),
    300,
    Math.max(300, workAreaHeight - 24),
  );
  const preferredHeight = Number(options.textHeight);
  const finalWidth = clamp(width, 260, Math.max(260, workAreaWidth - 24));
  const finalHeight = clamp(
    isFiniteNumber(preferredHeight) && preferredHeight > 0 ? Math.round(preferredHeight) : TEXT_DEFAULT_HEIGHT,
    TEXT_MIN_HEIGHT,
    maxHeight,
  );
  return { width: finalWidth, height: finalHeight };
}

export function chooseContainerPosition(mouseX, mouseY, width, height, workArea) {
  const workLeft = workArea.left;
  const workTop = workArea.top;
  const workRight = workLeft + workArea.width;
  const workBottom = workTop + workArea.height;

  if (
    !isFiniteNumber(mouseX) ||
    !isFiniteNumber(mouseY) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    !isFiniteNumber(workLeft) ||
    !isFiniteNumber(workTop) ||
    !isFiniteNumber(workRight) ||
    !isFiniteNumber(workBottom)
  ) {
    return { left: 0, top: 0 };
  }

  // 右下 -> 左下 -> 左上 -> 右上
  const candidates = [
    { x: mouseX + PREVIEW_OFFSET, y: mouseY + PREVIEW_OFFSET },
    { x: mouseX - PREVIEW_OFFSET - width, y: mouseY + PREVIEW_OFFSET },
    { x: mouseX - PREVIEW_OFFSET - width, y: mouseY - PREVIEW_OFFSET - height },
    { x: mouseX + PREVIEW_OFFSET, y: mouseY - PREVIEW_OFFSET - height },
  ];

  const canFit = (x, y) =>
    x >= workLeft &&
    y >= workTop &&
    x + width <= workRight &&
    y + height <= workBottom;

  const matched = candidates.find((candidate) => canFit(candidate.x, candidate.y));
  const fallback = matched || candidates[0];

  return {
    left: clamp(fallback.x, workLeft, Math.max(workLeft, workRight - width)),
    top: clamp(fallback.y, workTop, Math.max(workTop, workBottom - height)),
  };
}

export function estimateTextHeight(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return TEXT_DEFAULT_HEIGHT;
  }

  const lines = text.split(/\r\n|\n|\r/).length;
  const estimated = 22 + lines * 22;
  return Math.max(TEXT_MIN_HEIGHT, estimated);
}

export function parseImageFilePath(content) {
  if (typeof content !== 'string' || !content.startsWith('files:')) {
    return '';
  }

  try {
    const filesData = JSON.parse(content.slice(6));
    const first = filesData?.files?.[0];
    if (!first) return '';
    return first.actual_path || first.path || '';
  } catch {
    return '';
  }
}

export function parseRawImagePath(content) {
  if (typeof content !== 'string') {
    return '';
  }
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith('files:') || trimmed.startsWith('data:image/')) {
    return '';
  }
  return trimmed;
}

export function parseFirstImageId(imageId) {
  if (typeof imageId !== 'string' || !imageId.trim()) {
    return '';
  }
  return imageId
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.length > 0) || '';
}

export function parseImageDimensionsFromItem(item) {
  const content = typeof item?.content === 'string' ? item.content : '';
  if (!content.startsWith('files:')) {
    return null;
  }

  try {
    const filesData = JSON.parse(content.slice(6));
    const first = filesData?.files?.[0];
    const width = Number(first?.width);
    const height = Number(first?.height);
    if (isFiniteNumber(width) && width > 0 && isFiniteNumber(height) && height > 0) {
      return { width, height };
    }
  } catch {
    return null;
  }

  return null;
}
