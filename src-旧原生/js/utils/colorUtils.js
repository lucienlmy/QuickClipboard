/**
 * 颜色工具模块
 * 负责检测、识别和预览颜色值
 */

/**
 * 检测文本是否为颜色值
 */
export function detectColor(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmedText = text.trim();

  // 检测 HEX 颜色 (#RGB 或 #RRGGBB 或 #RRGGBBAA)
  const hexMatch = trimmedText.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hexMatch) {
    const rgb = hexToRgb(trimmedText);
    if (rgb) {
      return {
        type: 'hex',
        value: trimmedText.toUpperCase(),
        rgb
      };
    }
  }

  // 检测 RGB 颜色 (rgb(r, g, b) 或 rgba(r, g, b, a))
  const rgbMatch = trimmedText.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    if (r <= 255 && g <= 255 && b <= 255) {
      return {
        type: 'rgb',
        value: trimmedText,
        rgb: { r, g, b }
      };
    }
  }

  // 检测 HSL 颜色 (hsl(h, s%, l%) 或 hsla(h, s%, l%, a))
  const hslMatch = trimmedText.match(/^hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]);
    const s = parseInt(hslMatch[2]);
    const l = parseInt(hslMatch[3]);
    if (h <= 360 && s <= 100 && l <= 100) {
      const rgb = hslToRgb(h, s, l);
      return {
        type: 'hsl',
        value: trimmedText,
        rgb
      };
    }
  }

  return null;
}

/**
 * 将 HEX 颜色转换为 RGB
 */
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }
  
  // 处理短格式 #RGB
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16)
    };
  }
  
  return null;
}

/**
 * 将 RGB 颜色转换为 HEX
 */
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

/**
 * 将 HSL 颜色转换为 RGB
 */
export function hslToRgb(h, s, l) {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l; // 灰色
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

/**
 * 根据背景颜色计算对比文字颜色
 */
export function getContrastTextColor(r, g, b) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // 如果亮度大于 0.5，使用黑色文字；否则使用白色文字
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * 生成颜色预览 HTML
 */
export function generateColorPreviewHTML(colorInfo) {
  const { value, rgb } = colorInfo;
  const bgColor = rgbToHex(rgb.r, rgb.g, rgb.b);
  const textColor = getContrastTextColor(rgb.r, rgb.g, rgb.b);
  
  return `
    <span class="color-preview-container">
      <span class="color-preview-swatch" style="background-color: ${bgColor};"></span>
      <span class="color-preview-value" style="background-color: ${bgColor}; color: ${textColor};">${value}</span>
    </span>
  `;
}

/**
 * 检测并包装文本中的颜色值
 */
export function wrapColorInText(text) {
  const colorInfo = detectColor(text);
  if (colorInfo) {
    return generateColorPreviewHTML(colorInfo);
  }
  return text;
}

