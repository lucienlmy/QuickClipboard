// 选择工具
export const createSelectTool = () => {
  return {
    id: 'select',
    name: '选择',
    parameters: [],
    getDefaultStyle: () => ({}),

    createShape: () => null,
    updateShape: (shape) => shape,
  };
};
