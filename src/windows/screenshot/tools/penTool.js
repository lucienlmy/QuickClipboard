
export const createPenTool = () => {
  return {
    id: 'pen',
    name: '画笔',
    
    // 创建新形状
    createShape: (pos, style) => {
      return {
        tool: 'pen',
        points: [pos.x, pos.y],
        stroke: style.stroke || '#df4b26',
        strokeWidth: style.strokeWidth || 3,
        tension: 0.5,
        lineCap: 'round',
        lineJoin: 'round',
        globalCompositeOperation: 'source-over',
      };
    },

    // 更新形状
    updateShape: (shape, pos) => {
      const newPoints = shape.points.concat([pos.x, pos.y]);
      return {
        ...shape,
        points: newPoints,
      };
    },
  };
};
