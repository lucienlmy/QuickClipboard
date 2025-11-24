import { proxy } from 'valtio';

// 鼠标位置状态管理
export const mouseStore = proxy({
  position: null,
});

// 更新鼠标位置
export function updateMousePosition(pos) {
  mouseStore.position = pos;
}

// 清除鼠标位置
export function clearMousePosition() {
  mouseStore.position = null;
}
