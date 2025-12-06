//选区状态管理 Hook

import { useState, useCallback } from 'react';
import { applyAspectRatio } from '../utils/selectionOperations';
import { ASPECT_RATIO_PRESETS } from '../constants/selectionConstants';

export function useSelection() {
  const [selection, setSelection] = useState(null);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIO_PRESETS.FREE);

  const updateSelection = useCallback((newSelection) => {
    setSelection(newSelection);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setCornerRadius(0);
    setAspectRatio(ASPECT_RATIO_PRESETS.FREE);
  }, []);

  const updateCornerRadius = useCallback((radius) => {
    setCornerRadius(radius);
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
