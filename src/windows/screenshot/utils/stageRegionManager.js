// 截图画布区域管理器 - 管理多屏幕区域，限制组件在实际屏幕范围内显示

export class StageRegionManager {
  constructor(screens = []) {
    this.screens = screens;
    this.updateBounds();
  }

  // 更新屏幕数据
  updateScreens(screens) {
    this.screens = screens;
    this.updateBounds();
  }

  // 计算总体边界范围
  updateBounds() {
    if (!this.screens || this.screens.length === 0) {
      this.totalBounds = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }

    const minX = Math.min(...this.screens.map(s => s.x));
    const minY = Math.min(...this.screens.map(s => s.y));
    const maxX = Math.max(...this.screens.map(s => s.x + s.width));
    const maxY = Math.max(...this.screens.map(s => s.y + s.height));

    this.totalBounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // 检查点是否在任意屏幕范围内
  isPointInBounds(x, y) {
    if (!this.screens || this.screens.length === 0) {
      return false;
    }

    return this.screens.some(screen => {
      return (
        x >= screen.x &&
        x <= screen.x + screen.width &&
        y >= screen.y &&
        y <= screen.y + screen.height
      );
    });
  }

  // 检查矩形是否完全在屏幕范围内
  isRectInBounds(rect) {
    if (!rect || !this.screens || this.screens.length === 0) {
      return false;
    }

    // 检查矩形的四个角是否都在某个屏幕内
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ];

    return corners.every(corner => this.isPointInBounds(corner.x, corner.y));
  }

  // 检查某个屏幕的某条边是否有相邻屏幕
  hasAdjacentScreen(screen, edge) {
    const TOLERANCE = 2;

    return this.screens.some(otherScreen => {
      if (otherScreen === screen) return false;

      switch (edge) {
        case 'left':
          // 左边相邻：其他屏幕的右边 = 当前屏幕的左边
          return (
            Math.abs(otherScreen.x + otherScreen.width - screen.x) <= TOLERANCE &&
            !(otherScreen.y + otherScreen.height <= screen.y || otherScreen.y >= screen.y + screen.height)
          );
        case 'right':
          // 右边相邻：其他屏幕的左边 = 当前屏幕的右边
          return (
            Math.abs(otherScreen.x - (screen.x + screen.width)) <= TOLERANCE &&
            !(otherScreen.y + otherScreen.height <= screen.y || otherScreen.y >= screen.y + screen.height)
          );
        case 'top':
          // 上边相邻：其他屏幕的下边 = 当前屏幕的上边
          return (
            Math.abs(otherScreen.y + otherScreen.height - screen.y) <= TOLERANCE &&
            !(otherScreen.x + otherScreen.width <= screen.x || otherScreen.x >= screen.x + screen.width)
          );
        case 'bottom':
          // 下边相邻：其他屏幕的上边 = 当前屏幕的下边
          return (
            Math.abs(otherScreen.y - (screen.y + screen.height)) <= TOLERANCE &&
            !(otherScreen.x + otherScreen.width <= screen.x || otherScreen.x >= screen.x + screen.width)
          );
        default:
          return false;
      }
    });
  }

  // 限制矩形在屏幕范围内，相邻屏幕边界允许跨越
  constrainRect(rect) {
    if (!rect || !this.screens || this.screens.length === 0) {
      return rect;
    }

    let { x, y, width, height } = rect;

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    const isInValidScreen = this.isPointInBounds(centerX, centerY);
    let targetScreen = this.getNearestScreen(centerX, centerY);

    if (!targetScreen && this.screens.length > 0) {
      targetScreen = this.screens[0];
    }

    if (!targetScreen) {
      return rect;
    }

    if (isInValidScreen) {
      const hasLeft = this.hasAdjacentScreen(targetScreen, 'left');
      const hasRight = this.hasAdjacentScreen(targetScreen, 'right');
      const hasTop = this.hasAdjacentScreen(targetScreen, 'top');
      const hasBottom = this.hasAdjacentScreen(targetScreen, 'bottom');

      if (!hasRight && x + width > targetScreen.x + targetScreen.width) {
        x = targetScreen.x + targetScreen.width - width;
      }
      if (!hasBottom && y + height > targetScreen.y + targetScreen.height) {
        y = targetScreen.y + targetScreen.height - height;
      }
      if (!hasLeft && x < targetScreen.x) {
        x = targetScreen.x;
      }
      if (!hasTop && y < targetScreen.y) {
        y = targetScreen.y;
      }
    } else {
      if (x + width > targetScreen.x + targetScreen.width) {
        x = targetScreen.x + targetScreen.width - width;
      }
      if (y + height > targetScreen.y + targetScreen.height) {
        y = targetScreen.y + targetScreen.height - height;
      }
      if (x < targetScreen.x) {
        x = targetScreen.x;
      }
      if (y < targetScreen.y) {
        y = targetScreen.y;
      }
    }

    if (width > targetScreen.width) {
      width = targetScreen.width;
      x = targetScreen.x;
    }
    if (height > targetScreen.height) {
      height = targetScreen.height;
      y = targetScreen.y;
    }

    return { x, y, width, height };
  }

  // 限制点在屏幕范围内
  constrainPoint(point) {
    if (!point || !this.totalBounds) {
      return point;
    }

    const bounds = this.totalBounds;
    let { x, y } = point;

    x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width));
    y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height));

    return { x, y };
  }

  // 获取点所在或最近的屏幕
  getNearestScreen(x, y) {
    if (!this.screens || this.screens.length === 0) {
      return null;
    }

    const screenContainingPoint = this.screens.find(screen => {
      return (
        x >= screen.x &&
        x <= screen.x + screen.width &&
        y >= screen.y &&
        y <= screen.y + screen.height
      );
    });

    if (screenContainingPoint) {
      return screenContainingPoint;
    }

    // 找到距离最近的屏幕
    let nearestScreen = this.screens[0];
    let minDistance = Infinity;

    this.screens.forEach(screen => {
      const centerX = screen.x + screen.width / 2;
      const centerY = screen.y + screen.height / 2;
      const distance = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestScreen = screen;
      }
    });

    return nearestScreen;
  }

  // 获取总体边界信息
  getTotalBounds() {
    return this.totalBounds;
  }

  // 获取所有屏幕区域
  getScreens() {
    return this.screens;
  }
}

export function createStageRegionManager(screens) {
  return new StageRegionManager(screens);
}
