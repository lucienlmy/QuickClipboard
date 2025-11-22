import { useState, useRef, useCallback, useEffect } from 'react';
import { createPenTool } from '../tools/penTool';
import { createShapeTool } from '../tools/shapeTool';
import { createSelectTool } from '../tools/selectTool';
import { createCurveArrowTool } from '../tools/curveArrowTool';
import { createTextTool } from '../tools/textTool';
import { createMosaicTool } from '../tools/mosaicTool';
import { createWatermarkTool } from '../tools/watermarkTool';
import { recordColorHistory } from '../utils/colorHistory';
import { processMosaicShape } from '../utils/imageProcessor';
import { createPersistenceManager } from '../utils/toolParameterPersistence';

// 检查形状是否在框选范围内
const checkShapeInBox = (shape, box) => {
  if (shape.tool === 'pen' || shape.tool === 'curveArrow') {
    const offsetX = shape.x || shape.offsetX || 0;
    const offsetY = shape.y || shape.offsetY || 0;
    for (let i = 0; i < shape.points.length; i += 2) {
      const x = shape.points[i] + offsetX;
      const y = shape.points[i + 1] + offsetY;
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
        return true;
      }
    }
    return false;
  }
  
  // 马赛克工具
  if (shape.tool === 'mosaic') {
    if (shape.drawMode === 'brush') {
      const offsetX = shape.offsetX || 0;
      const offsetY = shape.offsetY || 0;
      for (let i = 0; i < shape.points.length; i += 2) {
        const x = shape.points[i] + offsetX;
        const y = shape.points[i + 1] + offsetY;
        if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
          return true;
        }
      }
      return false;
    }
    if (shape.drawMode === 'region') {
      const shapeBox = {
        x: shape.x,
        y: shape.y,
        width: Math.abs(shape.width),
        height: Math.abs(shape.height),
      };
      return !(shapeBox.x + shapeBox.width < box.x || 
               shapeBox.x > box.x + box.width ||
               shapeBox.y + shapeBox.height < box.y ||
               shapeBox.y > box.y + box.height);
    }
  }
  
  if (shape.tool === 'text') {
    const shapeBox = {
      x: shape.x,
      y: shape.y,
      width: shape.width || 200,
      height: shape.fontSize * 1.5 || 36,
    };
    return !(shapeBox.x + shapeBox.width < box.x || 
             shapeBox.x > box.x + box.width ||
             shapeBox.y + shapeBox.height < box.y ||
             shapeBox.y > box.y + box.height);
  }
  
  if (shape.tool === 'shape') {
    let shapeBox;
    
    if (shape.shapeType === 'circle' || shape.shapeType === 'diamond' || 
        (typeof shape.sides === 'number' && shape.sides >= 3)) {
      const cx = shape.centerX ?? (shape.x + shape.width / 2);
      const cy = shape.centerY ?? (shape.y + shape.height / 2);
      const radius = shape.radius ?? Math.max(Math.abs(shape.width), Math.abs(shape.height)) / 2;
      shapeBox = {
        x: cx - radius,
        y: cy - radius,
        width: radius * 2,
        height: radius * 2,
      };
    } else if (shape.shapeType === 'arrow' && shape.points) {
      const xs = [shape.points[0], shape.points[2]];
      const ys = [shape.points[1], shape.points[3]];
      shapeBox = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    } else {
      shapeBox = {
        x: shape.x,
        y: shape.y,
        width: Math.abs(shape.width),
        height: Math.abs(shape.height),
      };
    }
    
    return !(shapeBox.x + shapeBox.width < box.x || 
             shapeBox.x > box.x + box.width ||
             shapeBox.y + shapeBox.height < box.y ||
             shapeBox.y > box.y + box.height);
  }
  
  return false;
};

export default function useScreenshotEditing(screens = [], stageRef = null) {
  const [shapes, setShapes] = useState([]);
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const [activeToolId, setActiveToolId] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);
  const [selectedShapeIndices, setSelectedShapeIndices] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const [editingTextIndex, setEditingTextIndex] = useState(null);
  const isDrawingRef = useRef(false);
  const isSelectingRef = useRef(false);

  const tools = useRef({
    pen: createPenTool(),
    shape: createShapeTool(),
    curveArrow: createCurveArrowTool(),
    text: createTextTool(),
    mosaic: createMosaicTool(),
    watermark: createWatermarkTool(),
    select: createSelectTool(),
  });

  // 创建持久化管理器
  const persistenceManager = useRef(createPersistenceManager(tools.current));

  const getInitialToolStyles = () => {
    // 使用持久化管理器加载初始样式
    return persistenceManager.current.loadInitialToolStyles();
  };

  const [toolStyles, setToolStyles] = useState(getInitialToolStyles);

  // 选择模式下显示选中节点的工具参数
  const getActiveToolInfo = useCallback(() => {
    if (activeToolId === 'watermark') {
      return {
        tool: tools.current.watermark,
        style: toolStyles.watermark || tools.current.watermark.getDefaultStyle(),
      };
    }
    
    if (activeToolId === 'select' && selectedShapeIndices.length > 0) {
      // 多选时只显示删除按钮
      if (selectedShapeIndices.length > 1) {
        const deleteParam = {
          id: 'delete',
          type: 'button',
          label: `删除选中 (${selectedShapeIndices.length})`,
          icon: 'ti ti-trash',
          variant: 'danger',
          action: 'delete',
        };
        
        return {
          tool: {
            id: 'select',
            name: '多选',
            parameters: [deleteParam],
          },
          style: {},
          isSelectMode: true,
        };
      }
      
      // 单选时显示对应工具的参数
      const selectedShape = shapes[selectedShapeIndices[0]];
      if (selectedShape) {
        const shapeTool = selectedShape.tool;
        if (shapeTool && tools.current[shapeTool]) {
          const baseTool = tools.current[shapeTool];
          
          const deleteParam = {
            id: 'delete',
            type: 'button',
            label: '删除选中',
            icon: 'ti ti-trash',
            variant: 'danger',
            action: 'delete',
          };
          
          if (shapeTool === 'mosaic' && selectedShape.processedImage) {
            return {
              tool: {
                id: 'mosaic',
                name: '马赛克',
                parameters: [deleteParam],
              },
              style: {},
              isSelectMode: true,
            };
          }
          
          // 过滤掉不可修改的类型参数
          const typeParamIds = ['shapeType', 'lineStyle', 'mode'];
          const editableParams = (baseTool.parameters || []).filter(
            param => !typeParamIds.includes(param.id)
          );
          
          return {
            tool: {
              ...baseTool,
              parameters: [...editableParams, deleteParam],
            },
            style: selectedShape,
            isSelectMode: true,
          };
        }
      }
    }
    
    if (activeToolId && tools.current[activeToolId]) {
      return {
        tool: tools.current[activeToolId],
        style: toolStyles[activeToolId] || {},
      };
    }
    
    return { tool: null, style: {} };
  }, [activeToolId, selectedShapeIndices, shapes, toolStyles]);

  const { tool: activeTool, style: activeToolStyle, isSelectMode } = getActiveToolInfo();

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
    
    if (activeToolId === 'watermark') {
      setToolStyles(prev => {
        // 使用持久化管理器更新参数（自动保存）
        return persistenceManager.current.updateParameter('watermark', paramId, value, prev);
      });
      return;
    }
    
    if (activeToolId === 'select' && selectedShapeIndices.length === 1) {
      const newShapes = shapes.map((shape, i) => 
        i === selectedShapeIndices[0] ? { ...shape, [paramId]: value } : shape
      );
      setShapes(newShapes);
      const newHistory = history.slice(0, historyStep + 1);
      newHistory.push(newShapes);
      setHistory(newHistory);
      setHistoryStep(newHistory.length - 1);
      
      return;
    }
    
    setToolStyles(prev => {
      // 使用持久化管理器更新参数（自动保存）
      return persistenceManager.current.updateParameter(activeToolId, paramId, value, prev);
    });
  }, [activeToolId, selectedShapeIndices, shapes, history, historyStep]);

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

  const clearCanvas = useCallback(() => {
    setShapes([]);
    setSelectedShapeIndices([]);
    setCurrentShape(null);
    setSelectionBox(null);
    setEditingTextIndex(null);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push([]);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [history, historyStep]);

  const handleMouseDown = useCallback((e, relativePos) => {
    if (!activeToolId) return false;
    
    if (editingTextIndex !== null) {
      return true;
    }
    
    if (activeToolId === 'watermark') {
      return false;
    }
    
    if (activeToolId === 'select') {
      const isBackground = e.target.name && e.target.name() === 'editingLayerBackground';
      
      if (isBackground) {
        isSelectingRef.current = true;
        setSelectionBox({
          x: relativePos.x,
          y: relativePos.y,
          width: 0,
          height: 0,
        });
      }
      return true;
    }
    
    const tool = tools.current[activeToolId];
    if (!tool) return false;

    isDrawingRef.current = true;
    
    const newShape = tool.createShape(relativePos, activeToolStyle);
    setCurrentShape(newShape);
    
    return true;
  }, [activeToolId, activeToolStyle, editingTextIndex]);

  const handleMouseMove = useCallback((e, relativePos) => {
    if (!activeToolId) return false;
    
    if (activeToolId === 'select' && isSelectingRef.current && selectionBox) {
      const startX = selectionBox.x;
      const startY = selectionBox.y;
      const width = relativePos.x - startX;
      const height = relativePos.y - startY;
      
      setSelectionBox({
        x: startX,
        y: startY,
        width,
        height,
      });
      return true;
    }
    
    if (activeToolId === 'select' || !isDrawingRef.current || !currentShape) return false;

    const tool = tools.current[activeToolId];
    if (!tool) return false;

    const updatedShape = tool.updateShape(currentShape, relativePos);
    setCurrentShape(updatedShape);
    
    return true;
  }, [activeToolId, currentShape, selectionBox]);

  const handleMouseUp = useCallback(async (e) => {
    if (!activeToolId) return false;
    
    if (activeToolId === 'select') {
      if (isSelectingRef.current && selectionBox) {
        isSelectingRef.current = false;
        
        const box = {
          x: selectionBox.width >= 0 ? selectionBox.x : selectionBox.x + selectionBox.width,
          y: selectionBox.height >= 0 ? selectionBox.y : selectionBox.y + selectionBox.height,
          width: Math.abs(selectionBox.width),
          height: Math.abs(selectionBox.height),
        };
        
        if (box.width > 5 && box.height > 5) {
          const selectedIndices = shapes.reduce((acc, shape, index) => {
            const isInBox = checkShapeInBox(shape, box);
            if (isInBox) {
              acc.push(index);
            }
            return acc;
          }, []);
          
          setSelectedShapeIndices(selectedIndices);
        }
        
        setSelectionBox(null);
      }
      return true;
    }
    
    if (activeToolId === 'select' || !isDrawingRef.current) return false;

    if (currentShape) {
      let finalizedShape = (() => {
        if (currentShape.tool === 'shape') {
          const { _meta, ...rest } = currentShape;
          return rest;
        }
        if (currentShape.tool === 'text') {
          const { _isNew, ...rest } = currentShape;
          return rest;
        }
        return currentShape;
      })();

      // 如果是马赛克工具，处理图像
      if (finalizedShape.tool === 'mosaic') {
        try {
          setCurrentShape(null);
          
          await new Promise(resolve => setTimeout(resolve, 0));
          
          const processed = await processMosaicShape(finalizedShape, stageRef, screens, shapes);
          if (processed) {
            finalizedShape = processed;
          }
        } catch (error) {
          console.error('马赛克处理失败:', error);
        }
      }

      const newShapes = [...shapes, finalizedShape];
      setShapes(newShapes);
      pushToHistory(newShapes);
      if (finalizedShape.stroke) {
        recordColorHistory(finalizedShape.stroke);
      }
      if (finalizedShape.fill) {
        recordColorHistory(finalizedShape.fill);
      }
      
      if (currentShape.tool === 'text' && currentShape._isNew) {
        setEditingTextIndex(newShapes.length - 1);
      }
      
      setCurrentShape(null);
    }
    
    isDrawingRef.current = false;
    return true;
  }, [activeToolId, currentShape, shapes, pushToHistory, selectionBox, screens, stageRef]);

  const toggleSelectShape = useCallback((index, isMultiSelect) => {
    if (index === null) {
      setSelectedShapeIndices([]);
      return;
    }
    
    if (isMultiSelect) {
      setSelectedShapeIndices(prev => {
        if (prev.includes(index)) {
          return prev.filter(i => i !== index);
        }
        return [...prev, index];
      });
    } else {
      setSelectedShapeIndices([index]);
    }
  }, []);

  const deleteSelectedShapes = useCallback(() => {
    if (selectedShapeIndices.length === 0) return;
    const newShapes = shapes.filter((_, i) => !selectedShapeIndices.includes(i));
    setShapes(newShapes);
    pushToHistory(newShapes);
    setSelectedShapeIndices([]);
  }, [selectedShapeIndices, shapes, pushToHistory]);

  const updateSelectedShape = useCallback((updatedAttrs) => {
    if (selectedShapeIndices.length !== 1) return;
    const newShapes = shapes.map((shape, i) => 
      i === selectedShapeIndices[0] ? { ...shape, ...updatedAttrs } : shape
    );
    setShapes(newShapes);
    pushToHistory(newShapes);
  }, [selectedShapeIndices, shapes, pushToHistory]);

  useEffect(() => {
    if (activeToolId !== 'select') {
      setSelectedShapeIndices([]);
    }
  }, [activeToolId]);

  const updateTextContent = useCallback((index, text) => {
    if (index === null || index < 0 || index >= shapes.length) return;
    const newShapes = shapes.map((shape, i) => 
      i === index ? { ...shape, text } : shape
    );
    setShapes(newShapes);
    pushToHistory(newShapes);
  }, [shapes, pushToHistory]);

  const startEditingText = useCallback((index) => {
    setEditingTextIndex(index);
  }, []);

  const stopEditingText = useCallback(() => {
    setEditingTextIndex(null);
  }, []);

  // 处理持久化开关切换
  const handleTogglePersistence = useCallback((toolId, enabled) => {
    setToolStyles(prev => {
      return persistenceManager.current.togglePersistence(toolId, enabled, prev);
    });
  }, []);

  return {
    shapes: currentShape ? [...shapes, currentShape] : shapes,
    activeToolId,
    setActiveToolId,
    activeTool,
    toolParameters: activeTool?.parameters || [],
    toolStyle: activeToolStyle,
    isSelectMode: isSelectMode || false,
    handleToolParameterChange,
    handleTogglePersistence,
    undo,
    redo,
    clearCanvas,
    canUndo: historyStep > 0,
    canRedo: historyStep < history.length - 1,
    canClearCanvas: shapes.length > 0,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    selectedShapeIndices,
    toggleSelectShape,
    deleteSelectedShapes,
    updateSelectedShape,
    selectionBox,
    editingTextIndex,
    updateTextContent,
    startEditingText,
    stopEditingText,
    watermarkConfig: toolStyles.watermark,
  };
}
