// 形状坐标转换工具

export const shapeToRelative = (shape, bounds) => {
  if (!bounds || !bounds.width || !bounds.height) return shape;

  const { x: bx, y: by, width: bw, height: bh } = bounds;
  const result = { ...shape };

  if (typeof result.x === 'number') {
    result.x = (result.x - bx) / bw;
  }
  if (typeof result.y === 'number') {
    result.y = (result.y - by) / bh;
  }

  if (typeof result.offsetX === 'number') {
    result.offsetX = result.offsetX / bw;
  }
  if (typeof result.offsetY === 'number') {
    result.offsetY = result.offsetY / bh;
  }

  if (typeof result.width === 'number') {
    result.width = result.width / bw;
  }
  if (typeof result.height === 'number') {
    result.height = result.height / bh;
  }

  if (Array.isArray(result.points)) {
    if (result.tool === 'pen' || result.tool === 'polyline') {
      result.points = result.points.map((val, i) => (i % 2 === 0 ? (val - bx) / bw : (val - by) / bh));
    } else if (result.shapeType !== 'arrow') {
      result.points = result.points.map((val, i) => (i % 2 === 0 ? val / bw : val / bh));
    }
  }

  if (typeof result.size === 'number') {
    result.size = result.size / Math.min(bw, bh);
  }

  if (typeof result.fontSize === 'number') {
    result.fontSize = result.fontSize / bh;
  }

  if (typeof result.strokeWidth === 'number') {
    result.strokeWidth = result.strokeWidth / Math.min(bw, bh);
  }

  if (typeof result.brushSize === 'number') {
    result.brushSize = result.brushSize / Math.min(bw, bh);
  }

  if (typeof result.mosaicSize === 'number') {
    result.mosaicSize = result.mosaicSize / Math.min(bw, bh);
  }

  if (typeof result.blurRadius === 'number') {
    result.blurRadius = result.blurRadius / Math.min(bw, bh);
  }

  if (typeof result.radius === 'number') {
    result.radius = result.radius / Math.min(bw, bh);
  }

  if (typeof result.centerX === 'number') {
    result.centerX = (result.centerX - bx) / bw;
  }
  if (typeof result.centerY === 'number') {
    result.centerY = (result.centerY - by) / bh;
  }

  result._isRelative = true;

  return result;
};

export const shapeToAbsolute = (shape, bounds) => {
  if (!bounds || !bounds.width || !bounds.height || !shape._isRelative) return shape;

  const { x: bx, y: by, width: bw, height: bh } = bounds;
  const result = { ...shape };
  delete result._isRelative;

  if (typeof result.x === 'number') {
    result.x = result.x * bw + bx;
  }
  if (typeof result.y === 'number') {
    result.y = result.y * bh + by;
  }

  if (typeof result.offsetX === 'number') {
    result.offsetX = result.offsetX * bw;
  }
  if (typeof result.offsetY === 'number') {
    result.offsetY = result.offsetY * bh;
  }

  if (typeof result.width === 'number') {
    result.width = result.width * bw;
  }
  if (typeof result.height === 'number') {
    result.height = result.height * bh;
  }

  if (Array.isArray(result.points)) {
    if (result.tool === 'pen' || result.tool === 'polyline') {
      result.points = result.points.map((val, i) => (i % 2 === 0 ? val * bw + bx : val * bh + by));
    } else if (result.shapeType !== 'arrow') {
      result.points = result.points.map((val, i) => (i % 2 === 0 ? val * bw : val * bh));
    }
  }

  if (typeof result.size === 'number') {
    result.size = result.size * Math.min(bw, bh);
  }

  if (typeof result.fontSize === 'number') {
    result.fontSize = result.fontSize * bh;
  }

  if (typeof result.strokeWidth === 'number') {
    result.strokeWidth = result.strokeWidth * Math.min(bw, bh);
  }

  if (typeof result.brushSize === 'number') {
    result.brushSize = result.brushSize * Math.min(bw, bh);
  }

  if (typeof result.mosaicSize === 'number') {
    result.mosaicSize = result.mosaicSize * Math.min(bw, bh);
  }

  if (typeof result.blurRadius === 'number') {
    result.blurRadius = result.blurRadius * Math.min(bw, bh);
  }

  if (typeof result.radius === 'number') {
    result.radius = result.radius * Math.min(bw, bh);
  }

  if (typeof result.centerX === 'number') {
    result.centerX = result.centerX * bw + bx;
  }
  if (typeof result.centerY === 'number') {
    result.centerY = result.centerY * bh + by;
  }

  return result;
};
