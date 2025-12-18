//选区状态管理 Hook

import { useState, useCallback, useEffect } from 'react';
import { applyAspectRatio } from '../utils/selectionOperations';
import { ASPECT_RATIO_PRESETS } from '../constants/selectionConstants';

const CORNER_RADIUS_STORAGE_KEY = 'screenshot_corner_radius';

// 加载圆角值
function loadCornerRadius() {
  try {
    const stored = localStorage.getItem(CORNER_RADIUS_STORAGE_KEY);
    if (stored !== null) {
      const value = parseFloat(stored);
      return isNaN(value) ? 0 : value;
    }
  } catch (error) {
    console.error('加载圆角半径失败：', error);
  }
  return 0;
}

// 保存圆角值
function saveCornerRadius(radius) {
  try {
    localStorage.setItem(CORNER_RADIUS_STORAGE_KEY, String(radius));
  } catch (error) {
    console.error('无法保存圆角半径：', error);
  }
}

export function useSelection() {
  const [selection, setSelection] = useState(null);
  const [cornerRadius, setCornerRadius] = useState(() => loadCornerRadius());
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIO_PRESETS.FREE);

  const updateSelection = useCallback((newSelection) => {
    setSelection(newSelection);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setAspectRatio(ASPECT_RATIO_PRESETS.FREE);
  }, []);

  const updateCornerRadius = useCallback((radius) => {
    setCornerRadius(radius);
    saveCornerRadius(radius);
  }, []);

  const updateAspectRatio = useCallback((value, bounds = null) => {
    setAspectRatio(value);

    if (value !== ASPECT_RATIO_PRESETS.FREE && selection) {
      const newSelection = applyAspectRatio(selection, value, bounds);
      setSelection(newSelection);
    }
  }, [selection]);

  const updateSelectionSize = useCallback((width, height) => {
    if (!selection) return;
    setSelection({
      ...selection,
      width: Math.max(1, width),
      height: Math.max(1, height),
    });
  }, [selection]);

  const hasValidSelection = selection && selection.width > 0 && selection.height > 0;

  return {
    selection,
    cornerRadius,
    aspectRatio,
    hasValidSelection,
    updateSelection,
    clearSelection,
    updateCornerRadius,
    updateAspectRatio,
    updateSelectionSize,
  };
}
