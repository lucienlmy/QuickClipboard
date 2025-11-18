//选区操作相关的纯函数工具

//计算是否在选区内部
export function isPointInsideSelection(point, selection) {
  if (!selection) return false;
  return (
    point.x >= selection.x &&
    point.x <= selection.x + selection.width &&
    point.y >= selection.y &&
    point.y <= selection.y + selection.height
  );
}

//根据起点和当前点计算选区
export function calculateSelectionFromPoints(startPos, currentPos) {
  const x = Math.min(startPos.x, currentPos.x);
  const y = Math.min(startPos.y, currentPos.y);
  const width = Math.abs(currentPos.x - startPos.x);
  const height = Math.abs(currentPos.y - startPos.y);
  return { x, y, width, height };
}

//根据移动偏移量计算新选区位置
export function calculateMovedSelection(selection, pos, moveOffset) {
  return {
    ...selection,
    x: pos.x - moveOffset.dx,
    y: pos.y - moveOffset.dy,
  };
}

//根据调整手柄计算新选区
export function calculateResizedSelection(initialSelection, handleType, dx, dy) {
  let newSelection = { ...initialSelection };

  switch (handleType) {
    case 'nw':
      newSelection.x = initialSelection.x + dx;
      newSelection.y = initialSelection.y + dy;
      newSelection.width = initialSelection.width - dx;
      newSelection.height = initialSelection.height - dy;
      break;
    case 'n':
      newSelection.y = initialSelection.y + dy;
      newSelection.height = initialSelection.height - dy;
      break;
    case 'ne':
      newSelection.y = initialSelection.y + dy;
      newSelection.width = initialSelection.width + dx;
      newSelection.height = initialSelection.height - dy;
      break;
    case 'e':
      newSelection.width = initialSelection.width + dx;
      break;
    case 'se':
      newSelection.width = initialSelection.width + dx;
      newSelection.height = initialSelection.height + dy;
      break;
    case 's':
      newSelection.height = initialSelection.height + dy;
      break;
    case 'sw':
      newSelection.x = initialSelection.x + dx;
      newSelection.width = initialSelection.width - dx;
      newSelection.height = initialSelection.height + dy;
      break;
    case 'w':
      newSelection.x = initialSelection.x + dx;
      newSelection.width = initialSelection.width - dx;
      break;
  }

  // 处理负数宽高
  if (newSelection.width < 0) {
    newSelection.x += newSelection.width;
    newSelection.width = Math.abs(newSelection.width);
  }
  if (newSelection.height < 0) {
    newSelection.y += newSelection.height;
    newSelection.height = Math.abs(newSelection.height);
  }

  return newSelection;
}

//计算圆角调整的 delta
export function calculateRadiusDelta(radiusHandleType, dx, dy) {
  switch (radiusHandleType) {
    case 'radius-nw':
      return dx + dy;
    case 'radius-ne':
      return -dx + dy;
    case 'radius-se':
      return -dx - dy;
    case 'radius-sw':
      return dx - dy;
    default:
      return 0;
  }
}

//根据 delta 计算新圆角半径
export function calculateNewRadius(initialRadius, delta, selection) {
  const sensitivity = 0.3;
  let newRadius = initialRadius + delta * sensitivity;
  const maxRadius = selection ? Math.min(selection.width, selection.height) / 2 : 0;
  return Math.max(0, Math.min(newRadius, maxRadius));
}

//根据宽高比调整选区高度
export function applyAspectRatio(selection, aspectRatioValue) {
  const ratio = parseFloat(aspectRatioValue);
  if (!isNaN(ratio) && ratio > 0) {
    return {
      ...selection,
      height: selection.width / ratio,
    };
  }
  return selection;
}

//线性插值
export function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

//插值计算矩形
export function lerpRect(fromRect, toRect, progress) {
  return {
    x: lerp(fromRect.x, toRect.x, progress),
    y: lerp(fromRect.y, toRect.y, progress),
    width: lerp(fromRect.width, toRect.width, progress),
    height: lerp(fromRect.height, toRect.height, progress),
  };
}
