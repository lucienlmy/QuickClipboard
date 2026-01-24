import { useState, useEffect, useRef } from 'react';
import { Rect } from 'react-konva';

export const applyOpacity = (color, opacity = 1) => {
  if (!color) return undefined;
  if (opacity >= 1) return color;
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
};

export const HOVER_STROKE_COLOR = '#1677ff';
export const HOVER_STROKE_WIDTH = 2;
export const HOVER_DASH = [4, 4];
export const SELECTION_STROKE_COLOR = '#00a8ff';

export const createCommonProps = (isSelected, onSelect, index, activeToolId, shapeTool, setIsHovered, onHoverChange) => {
  const canSelect = activeToolId === 'select' || activeToolId === shapeTool;
  return {
    name: `shape-${shapeTool}-${index}`,
    listening: true,
    draggable: isSelected,
    onClick: (e) => {
      if (canSelect) {
        e.cancelBubble = true;
        onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
      }
    },
    onTap: (e) => {
      if (canSelect) {
        e.cancelBubble = true;
        onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
      }
    },
    onMouseEnter: () => {
      if (canSelect) {
        setIsHovered?.(true);
        onHoverChange?.(true);
      }
    },
    onMouseLeave: () => {
      setIsHovered?.(false);
      onHoverChange?.(false);
    },
  };
};

export const HighlightBorder = ({ nodeRef, visible, isSelection = false }) => {
  const [bounds, setBounds] = useState(null);
  const updateTimeoutRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setBounds(null);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      return;
    }

    const updateBounds = () => {
      if (nodeRef?.current) {
        const rect = nodeRef.current.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: false });
        const padding = 3;
        const newBounds = {
          x: rect.x - padding,
          y: rect.y - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        };
        setBounds(newBounds);
      }
    };

    updateBounds();

    const node = nodeRef.current;
    const handleTransform = () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(updateBounds, 0);
    };

    node.on('transform', handleTransform);
    node.on('dragmove', handleTransform);

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      node.off('transform', handleTransform);
      node.off('dragmove', handleTransform);
    };
  }, [visible, nodeRef]);

  if (!visible || !bounds) return null;

  return (
    <Rect
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      stroke={isSelection ? SELECTION_STROKE_COLOR : HOVER_STROKE_COLOR}
      strokeWidth={HOVER_STROKE_WIDTH}
      dash={HOVER_DASH}
      listening={false}
    />
  );
};

export const HoverHighlight = ({ nodeRef, visible }) => (
  <HighlightBorder nodeRef={nodeRef} visible={visible} isSelection={false} />
);
