import { useState, useRef, useCallback, useEffect } from 'react';
import { createPenTool } from '../tools/penTool';
import { recordColorHistory } from '../utils/colorHistory';

export default function useScreenshotEditing() {
  const [shapes, setShapes] = useState([]);
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const [activeToolId, setActiveToolId] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);
  
  const isDrawingRef = useRef(false);
  
  const tools = useRef({
    pen: createPenTool(),
  });

  const getInitialToolStyles = () => {
    return Object.entries(tools.current).reduce((acc, [toolId, tool]) => {
      acc[toolId] = tool?.getDefaultStyle ? tool.getDefaultStyle() : {};
      return acc;
    }, {});
  };

  const [toolStyles, setToolStyles] = useState(getInitialToolStyles);

  const activeTool = activeToolId ? tools.current[activeToolId] : null;
  const activeToolStyle = activeToolId ? toolStyles[activeToolId] || {} : {};

  useEffect(() => {
    if (!activeToolId) return;
    setToolStyles(prev => {
      if (prev[activeToolId]) {
        return prev;
      }
      const tool = tools.current[activeToolId];
      return {
        ...prev,
        [activeToolId]: tool?.getDefaultStyle ? tool.getDefaultStyle() : {},
      };
    });
  }, [activeToolId]);

  const handleToolParameterChange = useCallback((paramId, value) => {
    if (!activeToolId) return;
    setToolStyles(prev => {
      const currentStyle = prev[activeToolId] || {};
      return {
        ...prev,
        [activeToolId]: {
          ...currentStyle,
          [paramId]: value,
        },
      };
    });
  }, [activeToolId]);

  const pushToHistory = useCallback((newShapes) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [history, historyStep]);

  const undo = useCallback(() => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      setHistoryStep(newStep);
      setShapes(history[newStep]);
    }
  }, [history, historyStep]);

  const redo = useCallback(() => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      setHistoryStep(newStep);
      setShapes(history[newStep]);
    }
  }, [history, historyStep]);

  const handleMouseDown = useCallback((e, relativePos) => {
    if (!activeToolId) return false;
    
    const tool = tools.current[activeToolId];
    if (!tool) return false;

    isDrawingRef.current = true;
    
    const newShape = tool.createShape(relativePos, activeToolStyle);
    setCurrentShape(newShape);
    
    return true;
  }, [activeToolId, activeToolStyle]);

  const handleMouseMove = useCallback((e, relativePos) => {
    if (!activeToolId || !isDrawingRef.current || !currentShape) return false;

    const tool = tools.current[activeToolId];
    if (!tool) return false;

    const updatedShape = tool.updateShape(currentShape, relativePos);
    setCurrentShape(updatedShape);
    
    return true;
  }, [activeToolId, currentShape]);

  const handleMouseUp = useCallback(() => {
    if (!activeToolId || !isDrawingRef.current) return false;

    if (currentShape) {
      const newShapes = [...shapes, currentShape];
      setShapes(newShapes);
      pushToHistory(newShapes);
      if (currentShape.stroke) {
        recordColorHistory(currentShape.stroke);
      }
      setCurrentShape(null);
    }
    
    isDrawingRef.current = false;
    return true;
  }, [activeToolId, currentShape, shapes, pushToHistory]);

  return {
    shapes: currentShape ? [...shapes, currentShape] : shapes,
    activeToolId,
    setActiveToolId,
    activeTool,
    toolParameters: activeTool?.parameters || [],
    toolStyle: activeToolStyle,
    handleToolParameterChange,
    undo,
    redo,
    canUndo: historyStep > 0,
    canRedo: historyStep < history.length - 1,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
