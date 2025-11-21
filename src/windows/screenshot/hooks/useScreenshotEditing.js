import { useState, useRef, useCallback, useEffect } from 'react';
import { createPenTool } from '../tools/penTool';
import { createShapeTool } from '../tools/shapeTool';
import { createSelectTool } from '../tools/selectTool';
import { recordColorHistory } from '../utils/colorHistory';

export default function useScreenshotEditing() {
  const [shapes, setShapes] = useState([]);
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const [activeToolId, setActiveToolId] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);
  const [selectedShapeIndex, setSelectedShapeIndex] = useState(null);
  
  const isDrawingRef = useRef(false);
  
  const tools = useRef({
    pen: createPenTool(),
    shape: createShapeTool(),
    select: createSelectTool(),
  });

  const getInitialToolStyles = () => {
    return Object.entries(tools.current).reduce((acc, [toolId, tool]) => {
      acc[toolId] = tool?.getDefaultStyle ? tool.getDefaultStyle() : {};
      return acc;
    }, {});
  };

  const [toolStyles, setToolStyles] = useState(getInitialToolStyles);

  // 选择模式下显示选中节点的工具参数
  const getActiveToolInfo = useCallback(() => {
    if (activeToolId === 'select' && selectedShapeIndex !== null && shapes[selectedShapeIndex]) {
      const selectedShape = shapes[selectedShapeIndex];
      const shapeTool = selectedShape.tool;
      if (shapeTool && tools.current[shapeTool]) {
        const baseTool = tools.current[shapeTool];
        
        // 过滤掉不可修改的类型参数
        const typeParamIds = ['shapeType', 'lineStyle', 'mode'];
        const editableParams = (baseTool.parameters || []).filter(
          param => !typeParamIds.includes(param.id)
        );
        
        const deleteParam = {
          id: 'delete',
          type: 'button',
          label: '删除选中',
          icon: 'ti ti-trash',
          variant: 'danger',
          action: 'delete',
        };
        
        return {
          tool: {
            ...baseTool,
            parameters: [...editableParams, deleteParam],
          },
          style: selectedShape,
        };
      }
    }
    
    if (activeToolId && tools.current[activeToolId]) {
      return {
        tool: tools.current[activeToolId],
        style: toolStyles[activeToolId] || {},
      };
    }
    
    return { tool: null, style: {} };
  }, [activeToolId, selectedShapeIndex, shapes, toolStyles]);

  const { tool: activeTool, style: activeToolStyle } = getActiveToolInfo();

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
    
    if (activeToolId === 'select' && selectedShapeIndex !== null) {
      const newShapes = shapes.map((shape, i) => 
        i === selectedShapeIndex ? { ...shape, [paramId]: value } : shape
      );
      setShapes(newShapes);
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(newShapes);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
      
      return;
    }
    
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
  }, [activeToolId, selectedShapeIndex, shapes, history, historyStep]);

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
    
    if (activeToolId === 'select') {
      return false;
    }
    
    const tool = tools.current[activeToolId];
    if (!tool) return false;

    isDrawingRef.current = true;
    
    const newShape = tool.createShape(relativePos, activeToolStyle);
    setCurrentShape(newShape);
    
    return true;
  }, [activeToolId, activeToolStyle]);

  const handleMouseMove = useCallback((e, relativePos) => {
    if (!activeToolId || activeToolId === 'select' || !isDrawingRef.current || !currentShape) return false;

    const tool = tools.current[activeToolId];
    if (!tool) return false;

    const updatedShape = tool.updateShape(currentShape, relativePos);
    setCurrentShape(updatedShape);
    
    return true;
  }, [activeToolId, currentShape]);

  const handleMouseUp = useCallback(() => {
    if (!activeToolId || activeToolId === 'select' || !isDrawingRef.current) return false;

    if (currentShape) {
      const finalizedShape = (() => {
        if (currentShape.tool === 'shape') {
          const { _meta, ...rest } = currentShape;
          return rest;
        }
        return currentShape;
      })();

      const newShapes = [...shapes, finalizedShape];
      setShapes(newShapes);
      pushToHistory(newShapes);
      if (finalizedShape.stroke) {
        recordColorHistory(finalizedShape.stroke);
      }
      if (finalizedShape.fill) {
        recordColorHistory(finalizedShape.fill);
      }
      setCurrentShape(null);
    }
    
    isDrawingRef.current = false;
    return true;
  }, [activeToolId, currentShape, shapes, pushToHistory]);

  const selectShape = useCallback((index) => {
    setSelectedShapeIndex(index);
  }, []);

  const deleteSelectedShape = useCallback(() => {
    if (selectedShapeIndex === null) return;
    const newShapes = shapes.filter((_, i) => i !== selectedShapeIndex);
    setShapes(newShapes);
    pushToHistory(newShapes);
    setSelectedShapeIndex(null);
  }, [selectedShapeIndex, shapes, pushToHistory]);

  const updateSelectedShape = useCallback((updatedAttrs) => {
    if (selectedShapeIndex === null) return;
    const newShapes = shapes.map((shape, i) => 
      i === selectedShapeIndex ? { ...shape, ...updatedAttrs } : shape
    );
    setShapes(newShapes);
    pushToHistory(newShapes);
  }, [selectedShapeIndex, shapes, pushToHistory]);

  useEffect(() => {
    if (activeToolId !== 'select') {
      setSelectedShapeIndex(null);
    }
  }, [activeToolId]);

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
    selectedShapeIndex,
    selectShape,
    deleteSelectedShape,
    updateSelectedShape,
  };
}
