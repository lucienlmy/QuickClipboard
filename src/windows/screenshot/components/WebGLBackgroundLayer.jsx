import { useEffect, useRef, useState, memo } from 'react';
import { WebGLRenderer } from '../utils/webglRenderer';

function WebGLBackgroundLayer({ screens, stageWidth, stageHeight }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [error, setError] = useState(null);
  const lastRenderRef = useRef({ screens: null, width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!rendererRef.current) {
      try {
        rendererRef.current = new WebGLRenderer();
        rendererRef.current.initialize(canvas);
        setError(null);
      } catch (err) {
        console.error('[WebGL] 初始化失败:', err);
        setError(err.message || 'WebGL 初始化失败');
        return;
      }
    }

    if (rendererRef.current && stageWidth > 0 && stageHeight > 0) {
      const dpr = window.devicePixelRatio || 1;
      rendererRef.current.resize(stageWidth, stageHeight, dpr);
    }
    
    return () => {
      if (rendererRef.current) {
        try {
          rendererRef.current.destroy();
        } catch {}
        rendererRef.current = null;
      }
    };
  }, [stageWidth, stageHeight]);

  useEffect(() => {
    if (!rendererRef.current || !screens || screens.length === 0 || error) return;
    if (stageWidth <= 0 || stageHeight <= 0) return;

    const validScreens = screens.filter(s => s.image);
    if (validScreens.length === 0) return;

    const last = lastRenderRef.current;
    if (last.screens === screens && last.width === stageWidth && last.height === stageHeight) {
      return;
    }
    lastRenderRef.current = { screens, width: stageWidth, height: stageHeight };

    const dpr = window.devicePixelRatio || 1;
    rendererRef.current.resize(stageWidth, stageHeight, dpr);
    rendererRef.current.setScreens(validScreens, stageWidth, stageHeight);
    rendererRef.current.render();
  }, [screens, stageWidth, stageHeight, error]);

  if (error) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: stageWidth,
        height: stageHeight,
        pointerEvents: 'none',
        zIndex: -1,
        imageRendering: 'pixelated',
      }}
    />
  );
}

export default memo(WebGLBackgroundLayer);
