import { useState, useRef, useCallback, useEffect } from 'react';
import { createPenTool } from '../tools/penTool';
import { createShapeTool } from '../tools/shapeTool';
import { createSelectTool } from '../tools/selectTool';
import { createCurveArrowTool } from '../tools/curveArrowTool';
import { createPolylineTool } from '../tools/polylineTool';
import { createTextTool } from '../tools/textTool';
import { createMosaicTool } from '../tools/mosaicTool';
import { createWatermarkTool } from '../tools/watermarkTool';
import { createBorderTool } from '../tools/borderTool';
import { createNumberTool } from '../tools/numberTool';
import { createOcrTool } from '../tools/ocrTool';
import { recordColorHistory } from '../utils/colorHistory';
import { processMosaicShape } from '../utils/imageProcessor';
import { createPersistenceManager } from '../utils/toolParameterPersistence';
import { shapeToRelative, shapeToAbsolute } from '../utils/shapeCoordinates';

// 形状类型转换
const convertShapeType = (shape, newType) => {
  let bounds;
  if (shape.shapeType === 'circle' || shape.shapeType === 'diamond' || 
      (typeof shape.sides === 'number' && shape.sides >= 3)) {
    const cx = shape.centerX ?? (shape.x + (shape.width || 0) / 2);
    const cy = shape.centerY ?? (shape.y + (shape.height || 0) / 2);
    const r = shape.radius ?? Math.max(Math.abs(shape.width || 0), Math.abs(shape.height || 0)) / 2;
    bounds = { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
  } else {
    bounds = { x: shape.x, y: shape.y, width: Math.abs(shape.width || 0), height: Math.abs(shape.height || 0) };
  }
  
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const size = Math.min(bounds.width, bounds.height);
  const radius = size / 2;

  const base = {
    tool: 'shape',
    shapeType: newType,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    strokeOpacity: shape.strokeOpacity,
    fill: shape.fill,
    fillOpacity: shape.fillOpacity,
  };

  const polygonConfigs = {
    triangle: { sides: 3, rotation: 0 },
    pentagon: { sides: 5, rotation: 0 },
  };
  
  switch (newType) {
    case 'rectangle':
    case 'ellipse':
      return { ...base, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    
    case 'circle':
      return { ...base, x: centerX - radius, y: centerY - radius, width: size, height: size, centerX, centerY, radius };
    
    case 'diamond':
      return {
        ...base,
        x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        centerX, centerY,
        points: [centerX, bounds.y, bounds.x + bounds.width, centerY, centerX, bounds.y + bounds.height, bounds.x, centerY],
        rotation: 0,
      };
    
    case 'triangle':
    case 'pentagon':
      const config = polygonConfigs[newType];
      return {
        ...base,
        x: centerX - radius, y: centerY - radius, width: size, height: size,
        centerX, centerY, radius,
        sides: config.sides, rotation: config.rotation,
      };
    
    default:
      return { ...base, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }
};

// 检查形状是否在框选范围内
const checkShapeInBox = (shape, box) => {
  if (shape.tool === 'pen' || shape.tool === 'curveArrow' || shape.tool === 'polyline') {
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
      height: (shape.fontSize || 24) * (shape.lineHeight || 1.2),
    };
    return !(shapeBox.x + shapeBox.width < box.x || 
             shapeBox.x > box.x + box.width ||
             shapeBox.y + shapeBox.height < box.y ||
             shapeBox.y > box.y + box.height);
  }
  
  if (shape.tool === 'number') {
    const shapeBox = {
      x: shape.x,
      y: shape.y,
      width: shape.size || 32,
      height: shape.size || 32,
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

const clampToBounds = (pos, bounds) => {
  if (!bounds) return pos;
  return {
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, pos.x)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, pos.y)),
  };
};

export default function useScreenshotEditing(screens = [], stageRef = null, options = {}) {
  const { clipBounds = null, initialShapes = null } = options;
  const [shapes, setShapes] = useState([]);
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const initializedRef = useRef(false);
  const [activeToolId, setActiveToolId] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);
  const [selectedShapeIndices, setSelectedShapeIndices] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const [editingTextIndex, setEditingTextIndex] = useState(null);
  const [isHoveringShape, setIsHoveringShape] = useState(false);
  const isDrawingRef = useRef(false);
  const isSelectingRef = useRef(false);
  const lastClickRef = useRef({ x: 0, y: 0, time: 0 });

  const tools = useRef({
    pen: createPenTool(),
    shape: createShapeTool(),
    curveArrow: createCurveArrowTool(),
    polyline: createPolylineTool(),
    number: createNumberTool(),
    text: createTextTool(),
    mosaic: createMosaicTool(),
    watermark: createWatermarkTool(),
    border: createBorderTool(),
    select: createSelectTool(),
    ocr: createOcrTool(),
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
    
    if (activeToolId === 'border') {
      return {
        tool: tools.current.border,
        style: toolStyles.border || tools.current.border.getDefaultStyle(),
      };
    }
    
    if (selectedShapeIndices.length > 0) {
      const deleteParam = {
        id: 'delete',
        type: 'button',
        label: selectedShapeIndices.length > 1 ? `删除选中 (${selectedShapeIndices.length})` : '删除选中',
        icon: 'ti ti-trash',
        variant: 'danger',
        action: 'delete',
      };

      if (selectedShapeIndices.length > 1) {
        return {
          tool: { id: 'select', name: '多选', parameters: [deleteParam] },
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
          
          if (shapeTool === 'mosaic' && selectedShape.processedImage) {
            return {
              tool: { id: 'mosaic', name: '马赛克', parameters: [deleteParam] },
              style: {},
              isSelectMode: true,
            };
          }
          
          const getExcludeParams = (tool) => {
            switch (tool) {
              case 'pen': return ['lineStyle', 'mode'];
              case 'number': return ['currentNumber'];
              default: return [];
            }
          };
          const excludeParamIds = getExcludeParams(shapeTool);
          const editableParams = (baseTool.parameters || []).filter(
            param => !excludeParamIds.includes(param.id)
          );
          
          const mergedStyle = shapeTool === 'number' 
            ? { ...selectedShape, currentNumber: toolStyles.number?.currentNumber ?? 1 }
            : selectedShape;
          
          return {
            tool: { ...baseTool, parameters: [...editableParams, deleteParam] },
            style: mergedStyle,
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

  // 初始化编辑数据
  useEffect(() => {
    if (initializedRef.current || !initialShapes || !Array.isArray(initialShapes)) return;
    if (!clipBounds) return;
    initializedRef.current = true;

    const processInitialShapes = async () => {

      const allShapes = initialShapes.map((shape) => shapeToAbsolute(shape, clipBounds));
      const globalMosaicIndices = []; 
      const shapesWithoutGlobalMosaic = [];
      
      allShapes.forEach((shape, index) => {

        if (shape.tool === 'mosaic' && !shape.processedImage && shape.coverageMode === 'global') {
          globalMosaicIndices.push(index);
          shapesWithoutGlobalMosaic.push(null);
        } else if (shape.tool === 'mosaic' && !shape.processedImage) {
          shapesWithoutGlobalMosaic.push(shape);
        } else {
          shapesWithoutGlobalMosaic.push(shape);
        }
      });

      const processedShapes = await Promise.all(
        shapesWithoutGlobalMosaic.map(async (shape) => {
          if (!shape) return null;
          if (shape.tool === 'mosaic' && !shape.processedImage) {
            try {
              const processed = await processMosaicShape(shape, stageRef, screens, [], clipBounds);
              return processed || shape;
            } catch (error) {
              console.error('处理马赛克失败:', error);
              return shape;
            }
          }
          return shape;
        })
      );

      if (globalMosaicIndices.length === 0) {
        setShapes(processedShapes);
        setHistory([[], processedShapes]);
        setHistoryStep(1);
      } else {
        const tempShapes = processedShapes.filter(s => s !== null);
        setShapes(tempShapes);
        await new Promise(resolve => setTimeout(resolve, 150));
        const finalShapes = [...processedShapes];
        for (const index of globalMosaicIndices) {
          const mosaicShape = allShapes[index];
          try {
            const processed = await processMosaicShape(mosaicShape, stageRef, screens, tempShapes, clipBounds);
            if (processed) {
              finalShapes[index] = processed;
            } else {
              finalShapes[index] = mosaicShape;
            }
          } catch (error) {
            console.error('处理全局模式马赛克失败:', error);
            finalShapes[index] = mosaicShape;
          }
        }
        
        setShapes(finalShapes.filter(s => s !== null));
        setHistory([[], finalShapes.filter(s => s !== null)]);
        setHistoryStep(1);
      }

      const numberShapes = allShapes.filter((s) => s.tool === 'number');
      if (numberShapes.length > 0) {
        const maxNumber = Math.max(...numberShapes.map((s) => s.number || 0));
        setToolStyles((prev) => ({
          ...prev,
          number: {
            ...(prev.number || tools.current.number.getDefaultStyle()),
            currentNumber: maxNumber + 1,
          },
        }));
      }
    };

    setTimeout(processInitialShapes, 100);
  }, [initialShapes, screens, stageRef, clipBounds]);

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
    
    if (activeToolId === 'border') {
      setToolStyles(prev => {
        return persistenceManager.current.updateParameter('border', paramId, value, prev);
      });
      return;
    }
    
    // 有选中形状时，修改形状属性
    if (selectedShapeIndices.length === 1) {
      const selectedShape = shapes[selectedShapeIndices[0]];
      
      // 形状类型转换：需要重新计算形状数据
      if (paramId === 'shapeType' && selectedShape?.tool === 'shape') {
        const convertedShape = convertShapeType(selectedShape, value);
        const newShapes = shapes.map((shape, i) => 
          i === selectedShapeIndices[0] ? convertedShape : shape
        );
        setShapes(newShapes);
        const newHistory = history.slice(0, historyStep + 1);
        newHistory.push(newShapes);
        setHistory(newHistory);
        setHistoryStep(newHistory.length - 1);
        return;
      }
      
      // 箭头工具：lineStyle 改变需要重新计算 dash
      if (paramId === 'lineStyle' && selectedShape?.tool === 'curveArrow') {
        const strokeWidth = selectedShape.strokeWidth || 6;
        const dash = value === 'dashed' 
          ? [Math.max(strokeWidth * 2, 10), Math.max(strokeWidth * 1.5, 8)]
          : undefined;
        const newShapes = shapes.map((shape, i) => 
          i === selectedShapeIndices[0] ? { ...shape, lineStyle: value, dash } : shape
        );
        setShapes(newShapes);
        const newHistory = history.slice(0, historyStep + 1);
        newHistory.push(newShapes);
        setHistory(newHistory);
        setHistoryStep(newHistory.length - 1);
        return;
      }
      
      // 折线工具：lineStyle 改变需要重新计算 dash
      if (paramId === 'lineStyle' && selectedShape?.tool === 'polyline') {
        const strokeWidth = selectedShape.strokeWidth || 6;
        const dash = value === 'dashed'
          ? [Math.max(strokeWidth * 2, 8), Math.max(strokeWidth * 1.2, 4)]
          : undefined;
        const newShapes = shapes.map((shape, i) => 
          i === selectedShapeIndices[0] ? { ...shape, lineStyle: value, dash } : shape
        );
        setShapes(newShapes);
        const newHistory = history.slice(0, historyStep + 1);
        newHistory.push(newShapes);
        setHistory(newHistory);
        setHistoryStep(newHistory.length - 1);
        return;
      }
      
      // 箭头工具：strokeWidth 改变时，如果是虚线需要重新计算 dash
      if (paramId === 'strokeWidth' && selectedShape?.tool === 'curveArrow' && selectedShape?.lineStyle === 'dashed') {
        const dash = [Math.max(value * 2, 10), Math.max(value * 1.5, 8)];
        const newShapes = shapes.map((shape, i) => 
          i === selectedShapeIndices[0] ? { ...shape, strokeWidth: value, dash } : shape
        );
        setShapes(newShapes);
        const newHistory = history.slice(0, historyStep + 1);
        newHistory.push(newShapes);
        setHistory(newHistory);
        setHistoryStep(newHistory.length - 1);
        return;
      }
      
      // 折线工具：strokeWidth 改变时，如果是虚线需要重新计算 dash
      if (paramId === 'strokeWidth' && selectedShape?.tool === 'polyline' && selectedShape?.lineStyle === 'dashed') {
        const dash = [Math.max(value * 2, 8), Math.max(value * 1.2, 4)];
        const newShapes = shapes.map((shape, i) => 
          i === selectedShapeIndices[0] ? { ...shape, strokeWidth: value, dash } : shape
        );
        setShapes(newShapes);
        const newHistory = history.slice(0, historyStep + 1);
        newHistory.push(newShapes);
        setHistory(newHistory);
        setHistoryStep(newHistory.length - 1);
        return;
      }
      
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

  const finishPolylineIfDrawing = useCallback(() => {
    if (currentShape?.tool === 'polyline' && currentShape?.isDrawing) {
      const tool = tools.current.polyline;
      const finishedShape = tool.finishShape(currentShape);
      if (finishedShape.points.length >= 4) {
        const newShapes = [...shapes, finishedShape];
        setShapes(newShapes);
        setHistory(prev => [...prev.slice(0, historyStep + 1), newShapes]);
        setHistoryStep(prev => prev + 1);
      }
      setCurrentShape(null);
      isDrawingRef.current = false;
    }
  }, [currentShape, shapes, historyStep]);

  const handleSetActiveToolId = useCallback((newToolId) => {
    finishPolylineIfDrawing();
    setActiveToolId(newToolId);
  }, [finishPolylineIfDrawing]);

  const handleMouseDown = useCallback((e, relativePos) => {
    if (!activeToolId) return false;
    const clampedPos = clampToBounds(relativePos, clipBounds);
    const shiftKey = e.evt?.shiftKey || false;
    
    if (editingTextIndex !== null) {
      return true;
    }
    
    if (activeToolId === 'watermark' || activeToolId === 'border') {
      return false;
    }
    
    const targetName = e.target.name?.() || '';
    if (targetName.includes('_anchor') || targetName.includes('_rotater') || e.target.getClassName?.() === 'Transformer') {
      return true;
    }
    
    const stage = e.target.getStage?.();
    const clickedOnStage = e.target === stage;

    if (activeToolId === 'select') {
      if (clickedOnStage) {
        setSelectedShapeIndices([]);
        isSelectingRef.current = true;
        setSelectionBox({ x: clampedPos.x, y: clampedPos.y, width: 0, height: 0 });
      }
      return true;
    }
    
    if (activeToolId === 'polyline' && currentShape?.tool === 'polyline' && currentShape?.isDrawing) {
      const tool = tools.current.polyline;
      const now = Date.now();
      const last = lastClickRef.current;
      const dist = Math.sqrt((clampedPos.x - last.x) ** 2 + (clampedPos.y - last.y) ** 2);
      const timeDiff = now - last.time;
      const isDoubleClick = timeDiff < 300 && dist < 20;
      
      lastClickRef.current = { x: clampedPos.x, y: clampedPos.y, time: now };
      
      if (isDoubleClick) {
        const finishedShape = tool.finishShape(currentShape);
        if (finishedShape.points.length >= 4) {
          setShapes(prevShapes => [...prevShapes, finishedShape]);
          setHistory(prev => [...prev.slice(0, historyStep + 1), [...shapes, finishedShape]]);
          setHistoryStep(prev => prev + 1);
        }
        setCurrentShape(null);
        isDrawingRef.current = false;
      } else {
        const updatedShape = tool.addPoint(currentShape, clampedPos, { shiftKey });
        setCurrentShape(updatedShape);
      }
      return true;
    }
    
    // 点击空白时取消选中
    if (clickedOnStage && selectedShapeIndices.length > 0) {
      setSelectedShapeIndices([]);
      if (activeToolId === 'text') {
        return true;
      }
    }
    
    // 检查点击的形状类型
    if (!clickedOnStage) {
      let node = e.target;
      let shapeTool = null;
      while (node && node !== stage) {
        const name = node.name?.() || '';
        if (name.startsWith('shape-')) {
          const parts = name.split('-');
          shapeTool = parts[1];
          break;
        }
        node = node.getParent?.();
      }
      
      if (shapeTool === activeToolId) {
        return true;
      }
    }
    
    const tool = tools.current[activeToolId];
    if (!tool) return false;

    if (activeToolId === 'polyline') {
      const now = Date.now();
      const last = lastClickRef.current;
      const dist = Math.sqrt((clampedPos.x - last.x) ** 2 + (clampedPos.y - last.y) ** 2);
      const timeDiff = now - last.time;
      
      const isDoubleClick = timeDiff < 300 && dist < 20;
      
      lastClickRef.current = { x: clampedPos.x, y: clampedPos.y, time: now };
      
      if (currentShape?.tool === 'polyline' && currentShape?.isDrawing) {
        if (isDoubleClick) {
          const finishedShape = tool.finishShape(currentShape);
          if (finishedShape.points.length >= 4) {
            setShapes(prevShapes => [...prevShapes, finishedShape]);
            setHistory(prev => [...prev.slice(0, historyStep + 1), [...shapes, finishedShape]]);
            setHistoryStep(prev => prev + 1);
          }
          setCurrentShape(null);
          isDrawingRef.current = false;
        } else {
          const updatedShape = tool.addPoint(currentShape, clampedPos, { shiftKey });
          setCurrentShape(updatedShape);
        }
        return true;
      }
    }

    isDrawingRef.current = true;
    
    const newShape = tool.createShape(clampedPos, activeToolStyle);
    setCurrentShape(newShape);
    
    return true;
  }, [activeToolId, activeToolStyle, editingTextIndex, currentShape, shapes, historyStep, clipBounds, selectedShapeIndices]);

  const handleMouseMove = useCallback((e, relativePos) => {
    if (!activeToolId) return false;
    const clampedPos = clampToBounds(relativePos, clipBounds);
    const shiftKey = e.evt?.shiftKey || false;
    
    if (activeToolId === 'select' && isSelectingRef.current && selectionBox) {
      const startX = selectionBox.x;
      const startY = selectionBox.y;
      const width = clampedPos.x - startX;
      const height = clampedPos.y - startY;
      
      setSelectionBox({
        x: startX,
        y: startY,
        width,
        height,
      });
      return true;
    }
    
    if (activeToolId === 'polyline' && currentShape?.tool === 'polyline' && currentShape?.isDrawing) {
      const tool = tools.current[activeToolId];
      const updatedShape = tool.updateShape(currentShape, clampedPos, { shiftKey });
      setCurrentShape(updatedShape);
      return true;
    }
    
    if (activeToolId === 'select' || !isDrawingRef.current || !currentShape) return false;

    const tool = tools.current[activeToolId];
    if (!tool) return false;

    const updatedShape = tool.updateShape(currentShape, clampedPos, { shiftKey });
    setCurrentShape(updatedShape);
    
    return true;
  }, [activeToolId, currentShape, selectionBox, clipBounds]);

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

    if (activeToolId === 'polyline' && currentShape?.tool === 'polyline' && currentShape?.isDrawing) {
      return true;
    }

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
          
          const processed = await processMosaicShape(finalizedShape, stageRef, screens, shapes, clipBounds);
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
      
      // 创建完成后自动选中（马赛克、画笔、序号除外）
      if (finalizedShape.tool !== 'mosaic' && finalizedShape.tool !== 'pen' && finalizedShape.tool !== 'number') {
        setSelectedShapeIndices([newShapes.length - 1]);
      }
      
      // 记录颜色历史 - 画笔/箭头/形状工具
      if (finalizedShape.stroke) {
        recordColorHistory(finalizedShape.stroke);
      }
      // 记录颜色历史 - 文本/形状填充
      if (finalizedShape.fill) {
        recordColorHistory(finalizedShape.fill);
      }
      // 记录颜色历史 - 序号工具
      if (finalizedShape.tool === 'number') {
        if (finalizedShape.backgroundColor) {
          recordColorHistory(finalizedShape.backgroundColor);
        }
        if (finalizedShape.textColor) {
          recordColorHistory(finalizedShape.textColor);
        }
        if (finalizedShape.borderColor) {
          recordColorHistory(finalizedShape.borderColor);
        }
      }
      
      if (currentShape.tool === 'text' && currentShape._isNew) {
        setEditingTextIndex(newShapes.length - 1);
      }
      
      const currentTool = tools.current[activeToolId];
      if (currentTool?.afterCreate && toolStyles[activeToolId]) {
        const updatedStyle = currentTool.afterCreate(toolStyles[activeToolId]);
        setToolStyles(prev => ({
          ...prev,
          [activeToolId]: updatedStyle,
        }));
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

  const handleShapeClick = useCallback((index, isMultiSelect) => {
    if (activeToolId === 'select') {
      toggleSelectShape(index, isMultiSelect);
    } else {
      const clickedShape = shapes[index];
      if (clickedShape?.tool === activeToolId) {
        toggleSelectShape(index, isMultiSelect);
      }
    }
  }, [activeToolId, shapes, toggleSelectShape]);

  const deleteSelectedShapes = useCallback(() => {
    if (selectedShapeIndices.length === 0) return;
    const newShapes = shapes.filter((_, i) => !selectedShapeIndices.includes(i));
    setShapes(newShapes);
    pushToHistory(newShapes);
    setSelectedShapeIndices([]);
  }, [selectedShapeIndices, shapes, pushToHistory]);

  // 实时更新形状（拖动时用，不记录历史）
  const updateSelectedShapeLive = useCallback((updatedAttrs) => {
    if (selectedShapeIndices.length !== 1) return;
    setShapes(prev => prev.map((shape, i) =>
      i === selectedShapeIndices[0] ? { ...shape, ...updatedAttrs } : shape
    ));
  }, [selectedShapeIndices]);

  // 更新形状并记录历史（拖动结束时用）
  const updateSelectedShape = useCallback((updatedAttrs) => {
    if (selectedShapeIndices.length !== 1) return;
    const newShapes = shapes.map((shape, i) =>
      i === selectedShapeIndices[0] ? { ...shape, ...updatedAttrs } : shape
    );
    setShapes(newShapes);
    pushToHistory(newShapes);
  }, [selectedShapeIndices, shapes, pushToHistory]);

  const updateShapeByIndex = useCallback((index, updatedAttrs) => {
    if (index < 0 || index >= shapes.length) return;
    const newShapes = shapes.map((shape, i) =>
      i === index ? { ...shape, ...updatedAttrs } : shape
    );
    setShapes(newShapes);
    pushToHistory(newShapes);
  }, [shapes, pushToHistory]);

  useEffect(() => {
    if (!activeToolId) return;
    if (activeToolId === 'select') return;
    setSelectedShapeIndices(prev => {
      const filtered = prev.filter(i => shapes[i]?.tool === activeToolId);
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [activeToolId, shapes]);

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

  const handleDoubleClick = useCallback(() => {
    return false;
  }, []);

  return {
    shapes: currentShape ? [...shapes, currentShape] : shapes,
    activeToolId,
    setActiveToolId: handleSetActiveToolId,
    activeTool,
    toolParameters: activeTool?.parameters || [],
    toolStyle: activeToolStyle,
    isSelectMode: isSelectMode || false,
    isDrawingShape: currentShape !== null && !['number', 'text'].includes(currentShape?.tool),
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
    handleDoubleClick,
    selectedShapeIndices,
    setSelectedShapeIndices,
    toggleSelectShape,
    handleShapeClick,
    deleteSelectedShapes,
    updateSelectedShape,
    updateSelectedShapeLive,
    updateShapeByIndex,
    selectionBox,
    editingTextIndex,
    updateTextContent,
    startEditingText,
    stopEditingText,
    isHoveringShape,
    setIsHoveringShape,
    watermarkConfig: toolStyles.watermark,
    borderConfig: toolStyles.border,
    getSerializableShapes: useCallback((bounds = null) => {
      const effectiveBounds = bounds || clipBounds;
      return shapes.map((shape) => {
        const { processedImage, _meta, _isNew, ...rest } = shape;
        return shapeToRelative(rest, effectiveBounds);
      });
    }, [shapes, clipBounds]),
  };
}
