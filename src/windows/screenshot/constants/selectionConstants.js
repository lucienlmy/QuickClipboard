//选区相关常量配置

// 遮罩层样式
export const OVERLAY_COLOR = 'black';
export const OVERLAY_OPACITY = 0.4;

// 调整手柄样式
export const HANDLE_SIZE = 4;
export const HANDLE_COLOR = 'deepskyblue';
export const HANDLE_STROKE_COLOR = 'white';
export const HANDLE_STROKE_WIDTH = 1;
export const HANDLE_HIT_RADIUS = 8;

// 圆角调整手柄样式
export const RADIUS_HANDLE_SIZE = 3;
export const RADIUS_HANDLE_COLOR = 'orange';
export const RADIUS_HANDLE_OFFSET = 12;

// 选区边框样式
export const SELECTION_STROKE_COLOR = 'deepskyblue';
export const SELECTION_STROKE_WIDTH = 2;

// 动画配置
export const AUTO_SELECTION_ANIMATION_DURATION = 30;

// 拖拽阈值
export const DRAG_THRESHOLD = 5;

// 手柄类型枚举
export const HANDLE_TYPES = {
  NW: 'nw',
  N: 'n',
  NE: 'ne',
  E: 'e',
  SE: 'se',
  S: 's',
  SW: 'sw',
  W: 'w',
  RADIUS_NW: 'radius-nw',
  RADIUS_NE: 'radius-ne',
  RADIUS_SE: 'radius-se',
  RADIUS_SW: 'radius-sw',
};

// 光标样式映射
export const CURSOR_MAP = {
  [HANDLE_TYPES.NW]: 'nwse-resize',
  [HANDLE_TYPES.N]: 'ns-resize',
  [HANDLE_TYPES.NE]: 'nesw-resize',
  [HANDLE_TYPES.E]: 'ew-resize',
  [HANDLE_TYPES.SE]: 'nwse-resize',
  [HANDLE_TYPES.S]: 'ns-resize',
  [HANDLE_TYPES.SW]: 'nesw-resize',
  [HANDLE_TYPES.W]: 'ew-resize',
};

// 宽高比预设值
export const ASPECT_RATIO_PRESETS = {
  FREE: 'free',
  SQUARE: '1',
  RATIO_4_3: '1.333',
  RATIO_16_9: '1.778',
  RATIO_9_16: '0.5625',
};
