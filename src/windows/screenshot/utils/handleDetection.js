//控制手柄检测和定位相关工具

import {
  HANDLE_SIZE,
  HANDLE_HIT_RADIUS,
  RADIUS_HANDLE_SIZE,
  RADIUS_HANDLE_OFFSET,
  HANDLE_TYPES,
} from '../constants/selectionConstants';

//获取所有手柄的位置
export function getHandlePositions(selection) {
  if (!selection) return [];

  const { x, y, width, height } = selection;

  const resizeHandles = [
    { type: HANDLE_TYPES.NW, x, y },
    { type: HANDLE_TYPES.N, x: x + width / 2, y },
    { type: HANDLE_TYPES.NE, x: x + width, y },
    { type: HANDLE_TYPES.E, x: x + width, y: y + height / 2 },
    { type: HANDLE_TYPES.SE, x: x + width, y: y + height },
    { type: HANDLE_TYPES.S, x: x + width / 2, y: y + height },
    { type: HANDLE_TYPES.SW, x, y: y + height },
    { type: HANDLE_TYPES.W, x, y: y + height / 2 },
  ];

  const radiusHandles = [
    { type: HANDLE_TYPES.RADIUS_NW, x: x + RADIUS_HANDLE_OFFSET, y: y + RADIUS_HANDLE_OFFSET },
    { type: HANDLE_TYPES.RADIUS_NE, x: x + width - RADIUS_HANDLE_OFFSET, y: y + RADIUS_HANDLE_OFFSET },
    { type: HANDLE_TYPES.RADIUS_SE, x: x + width - RADIUS_HANDLE_OFFSET, y: y + height - RADIUS_HANDLE_OFFSET },
    { type: HANDLE_TYPES.RADIUS_SW, x: x + RADIUS_HANDLE_OFFSET, y: y + height - RADIUS_HANDLE_OFFSET },
  ];

  return [...resizeHandles, ...radiusHandles];
}

//检测鼠标点击是否命中手柄
export function checkHandleHit(pos, selection) {
  if (!selection) return null;

  const handles = getHandlePositions(selection);

  for (const handle of handles) {
    const dx = pos.x - handle.x;
    const dy = pos.y - handle.y;
    if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_HIT_RADIUS) {
      return handle.type;
    }
  }

  return null;
}

//判断是否是圆角调整手柄
export function isRadiusHandle(handleType) {
  return handleType && handleType.startsWith('radius-');
}

//获取手柄渲染配置
export function getHandleRenderConfig(handleType) {
  const isRadius = isRadiusHandle(handleType);
  return {
    isRadius,
    size: isRadius ? RADIUS_HANDLE_SIZE : HANDLE_SIZE,
  };
}
