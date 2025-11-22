// 光标生成工具

// 生成画笔圆形光标（SVG）
export function generateBrushCursor(size, color = '#ff4d4f', opacity = 1) {
  const cursorSize = Math.min(Math.max(size, 4), 64);
  const padding = 6;
  const svgSize = cursorSize + padding * 2;
  const center = svgSize / 2;
  const radius = cursorSize / 2;

  const fillColor = hexToRgba(color, opacity * 0.5);
  const strokeColor = color;
  const showCross = cursorSize > 16;
  const crossSize = 4;
  const svg = `
    <svg width="${svgSize}" height="${svgSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- 径向渐变 -->
        <radialGradient id="brush-gradient" cx="40%" cy="40%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:${opacity * 0.6}" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:${opacity * 0.3}" />
        </radialGradient>
        
        <!-- 阴影滤镜 -->
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
          <feOffset dx="0.5" dy="0.5" result="offsetblur"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <!-- 外圈黑色描边（对比度） -->
      <circle cx="${center}" cy="${center}" r="${radius + 1.5}" 
              fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="1"
              filter="url(#shadow)"/>
      
      <!-- 白色主描边（可见性） -->
      <circle cx="${center}" cy="${center}" r="${radius + 0.5}" 
              fill="none" stroke="white" stroke-width="1.5" 
              opacity="0.95"/>
      
      <!-- 内圈填充（渐变） -->
      <circle cx="${center}" cy="${center}" r="${radius}" 
              fill="url(#brush-gradient)"/>
      
      <!-- 内圈细边框 -->
      <circle cx="${center}" cy="${center}" r="${radius - 0.5}" 
              fill="none" stroke="${strokeColor}" stroke-width="0.5" 
              opacity="${opacity * 0.3}"/>
      
      ${showCross ? `
      <!-- 中心十字线 -->
      <g stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0.9" filter="url(#shadow)">
        <line x1="${center - crossSize}" y1="${center}" x2="${center + crossSize}" y2="${center}"/>
        <line x1="${center}" y1="${center - crossSize}" x2="${center}" y2="${center + crossSize}"/>
      </g>
      ` : ''}
    </svg>
  `.trim();

  const encodedSvg = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  
  const dataUri = `data:image/svg+xml,${encodedSvg}`;
  const hotspot = Math.round(svgSize / 2);
  
  return `url("${dataUri}") ${hotspot} ${hotspot}, crosshair`;
}

// 十六进制转 rgba
function hexToRgba(hex, alpha = 1) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 获取工具光标
export function getToolCursor(toolId, toolStyle = {}) {
  if (!toolId) {
    return 'default';
  }

  switch (toolId) {
    case 'pen':
      return generateBrushCursor(
        toolStyle.strokeWidth || 4,
        toolStyle.stroke || '#ff4d4f',
        toolStyle.opacity ?? 1
      );
    
    case 'mosaic':
      if (toolStyle.drawMode === 'brush') {
        return generateBrushCursor(
          toolStyle.brushSize || 20,
          '#888888',
          0.8
        );
      }
      return 'crosshair';
    
    case 'select':
      return 'default';
    
    case 'text':
      return 'text';
    
    case 'shape':
    case 'curveArrow':
    case 'watermark':
    default:
      return 'crosshair';
  }
}

// 光标缓存
const cursorCache = new Map();

export function getCachedToolCursor(toolId, toolStyle = {}) {
  if (!toolId) {
    return 'default';
  }

  if (toolId === 'pen' || (toolId === 'mosaic' && toolStyle.drawMode === 'brush')) {
    const size = toolId === 'pen' ? toolStyle.strokeWidth : toolStyle.brushSize;
    const color = toolId === 'pen' ? toolStyle.stroke : '#888888';
    const opacity = toolStyle.opacity ?? 1;
    
    const cacheKey = `${toolId}_${size}_${color}_${opacity}`;
    
    if (cursorCache.has(cacheKey)) {
      return cursorCache.get(cacheKey);
    }
    
    const cursor = getToolCursor(toolId, toolStyle);
    
    if (cursorCache.size > 50) {
      const firstKey = cursorCache.keys().next().value;
      cursorCache.delete(firstKey);
    }
    
    cursorCache.set(cacheKey, cursor);
    return cursor;
  }
  
  return getToolCursor(toolId, toolStyle);
}
