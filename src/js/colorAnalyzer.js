/**
 * 图像颜色分析工具
 */

/**
 * 获取图像的主色调（Median Cut）
 */
export async function getDominantColor(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = function () {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const maxSize = 480;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const pixels = [];
        const step = 4;
        for (let i = 0; i < data.length; i += 4 * step) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          pixels.push([r, g, b]);
        }

        if (pixels.length === 0) {
          return resolve({ r: 128, g: 128, b: 128, brightness: 0.5 });
        }

        // Median Cut 分成 6 类
        const clusters = medianCut(pixels, 6);

        let bestColor = null, bestScore = -1;
        for (const cluster of clusters) {
          if (cluster.length === 0) continue;
          const [r, g, b] = averageColor(cluster);
          const { s, l } = rgbToHsl(r, g, b);
          if (l < 10 || l > 92) continue;
          if (s < 12 && l > 70) continue;

          const score = cluster.length * (1 + s / 100) * (0.6 + l / 200);
          if (score > bestScore) {
            bestScore = score;
            bestColor = { r, g, b };
          }
        }

        if (!bestColor) bestColor = { r: 128, g: 128, b: 128 };

        const brightness =
          (bestColor.r * 0.299 +
            bestColor.g * 0.587 +
            bestColor.b * 0.114) /
          255;

        resolve({ ...bestColor, brightness });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error("无法加载图像"));
    img.src = imageUrl;
  });
}

/**
 * Median Cut 聚类
 */
function medianCut(pixels, maxClusters) {
  let clusters = [pixels];
  while (clusters.length < maxClusters) {
    let maxRangeClusterIndex = -1, maxRange = -1;
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      if (cluster.length <= 1) continue;
      const ranges = getColorRange(cluster);
      const range = Math.max(...ranges);
      if (range > maxRange) {
        maxRange = range;
        maxRangeClusterIndex = i;
      }
    }
    if (maxRangeClusterIndex === -1) break;
    const cluster = clusters[maxRangeClusterIndex];
    const ranges = getColorRange(cluster);
    const channel = ranges.indexOf(maxRange);
    cluster.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(cluster.length / 2);
    clusters.splice(maxRangeClusterIndex, 1, cluster.slice(0, mid), cluster.slice(mid));
  }
  return clusters;
}

function getColorRange(cluster) {
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
  for (const [r, g, b] of cluster) {
    if (r < minR) minR = r; if (g < minG) minG = g; if (b < minB) minB = b;
    if (r > maxR) maxR = r; if (g > maxG) maxG = g; if (b > maxB) maxB = b;
  }
  return [maxR - minR, maxG - minG, maxB - minB];
}

function averageColor(cluster) {
  let r = 0, g = 0, b = 0;
  for (const [rr, gg, bb] of cluster) {
    r += rr; g += gg; b += bb;
  }
  const n = cluster.length || 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/**
 * 工具函数
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max - min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/**
 * 相对亮度与对比度计算
 */
function getRelativeLuminance(r, g, b) {
  const srgbToLinear = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getContrastRatio(fg, bg) {
  const L1 = getRelativeLuminance(fg.r, fg.g, fg.b);
  const L2 = getRelativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 生成文本色 / 标题栏色 / 应用 & 移除方法
 */
export function generateAccessibleTextColor(backgroundColor, options = {}) {
  const { r, g, b } = backgroundColor;
  const targetContrast = options.minContrastRatio || 4.5;
  const maxHueShift = options.maxHueShift || 24;
  const bg = { r, g, b };
  const { h, s } = rgbToHsl(r, g, b);
  const isLightBg = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  const initialL = isLightBg ? 24 : 86;
  const minL = 8, maxL = 92;
  const baseS = clamp(s * 0.55, 12, 68);

  const hueSteps = [0, 6, 12, 18, 24].filter(v => v <= maxHueShift);
  const lightnessSteps = [0, 6, 10, 14, 18, 24, 30, 36, 42, 50, 58, 66, 76];

  const trySearch = () => {
    for (const hs of hueSteps) {
      for (const sign of [1, -1]) {
        const hh = (h + sign * hs + 360) % 360;
        for (const step of lightnessSteps) {
          const l1 = clamp(initialL + step * (isLightBg ? -1 : 1), minL, maxL);
          const l2 = clamp(initialL + step * (isLightBg ? 1 : -1), minL, maxL);
          for (const candL of [l1, l2]) {
            const cand = hslToRgb(hh, baseS, candL);
            if (getContrastRatio(cand, bg) >= targetContrast) return cand;
          }
        }
      }
    }
    return null;
  };

  const adjusted = trySearch();
  if (adjusted) return `rgb(${adjusted.r}, ${adjusted.g}, ${adjusted.b})`;

  const blackish = { r: 12, g: 12, b: 12 };
  const whitish = { r: 243, g: 243, b: 243 };
  const prefer = getContrastRatio(blackish, bg) >= getContrastRatio(whitish, bg) ? blackish : whitish;
  const mix = (c1, c2, t) => ({
    r: Math.round(c1.r * (1 - t) + c2.r * t),
    g: Math.round(c1.g * (1 - t) + c2.g * t),
    b: Math.round(c1.b * (1 - t) + c2.b * t)
  });
  const softened = mix(prefer, bg, 0.06);
  return `rgb(${softened.r}, ${softened.g}, ${softened.b})`;
}

export function generateTitleBarColors(backgroundColor) {
  const { r, g, b, brightness } = backgroundColor;
  const textColor = generateAccessibleTextColor({ r, g, b }, { minContrastRatio: 3.2, maxHueShift: 18 });
  const alpha = 1;
  const titleBarBg = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  let borderColor;
  if (brightness > 0.5) {
    const factor = 0.8;
    borderColor = `rgba(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)}, 0.3)`;
  } else {
    const factor = 1.3;
    borderColor = `rgba(${Math.min(255, Math.floor(r * factor))}, ${Math.min(255, Math.floor(g * factor))}, ${Math.min(255, Math.floor(b * factor))}, 0.3)`;
  }
  const { h, s } = rgbToHsl(r, g, b);
  const baseS = clamp(s * 1.1, 35, 85);
  const baseL = 52;
  const primary = hslToRgb(h, baseS, baseL);
  const hover = hslToRgb(h, baseS, clamp(baseL - 8, 20, 80));
  const dark = hslToRgb(h, baseS, clamp(baseL - 18, 10, 70));
  const light = hslToRgb(h, clamp(baseS * 0.4, 10, 60), 94);
  return {
    textColor,
    backgroundColor: titleBarBg,
    borderColor,
    brightness,
    accentPrimary: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
    accentHover: `rgb(${hover.r}, ${hover.g}, ${hover.b})`,
    accentDark: `rgb(${dark.r}, ${dark.g}, ${dark.b})`,
    accentLight: `rgb(${light.r}, ${light.g}, ${light.b})`
  };
}

export function applyTitleBarColors(colors) {
  document.documentElement.style.setProperty('--titlebar-bg-dynamic', colors.backgroundColor);
  document.documentElement.style.setProperty('--titlebar-text-dynamic', colors.textColor);
  document.documentElement.style.setProperty('--titlebar-border-dynamic', colors.borderColor);
  if (colors.accentPrimary) document.documentElement.style.setProperty('--primary-color', colors.accentPrimary);
  if (colors.accentHover) document.documentElement.style.setProperty('--primary-hover', colors.accentHover);
  if (colors.accentLight) document.documentElement.style.setProperty('--primary-light', colors.accentLight);
  if (colors.accentDark) document.documentElement.style.setProperty('--primary-dark', colors.accentDark);
  document.body.classList.add('has-dynamic-titlebar');
}

export function removeTitleBarColors() {
  document.documentElement.style.removeProperty('--titlebar-bg-dynamic');
  document.documentElement.style.removeProperty('--titlebar-text-dynamic');
  document.documentElement.style.removeProperty('--titlebar-border-dynamic');
  document.documentElement.style.removeProperty('--primary-color');
  document.documentElement.style.removeProperty('--primary-hover');
  document.documentElement.style.removeProperty('--primary-light');
  document.documentElement.style.removeProperty('--primary-dark');
  document.body.classList.remove('has-dynamic-titlebar');
}
