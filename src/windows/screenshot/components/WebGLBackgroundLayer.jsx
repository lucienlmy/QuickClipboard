import { useEffect, useRef, useState } from 'react';
import { WebGLRenderer } from '../utils/webglRenderer';

function WebGLBackgroundLayer({ screens, stageWidth, stageHeight }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer;
    try {
      renderer = new WebGLRenderer();
      renderer.initialize(canvas);
      const dpr = window.devicePixelRatio || 1;
      renderer.resize(stageWidth, stageHeight, dpr);
      rendererRef.current = renderer;
      setError(null);
      console.log('[WebGL] 渲染器初始化成功');
    } catch (err) {
      console.error('[WebGL] 初始化失败:', err);
      setError(err.message || 'WebGL 初始化失败');
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [stageWidth, stageHeight]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !screens || screens.length === 0 || error) return;

    const dpr = window.devicePixelRatio || 1;
    renderer.resize(stageWidth, stageHeight, dpr);
    renderer.setScreens(screens, stageWidth, stageHeight);
    renderer.render();
    console.log(`[WebGL] 已渲染 ${screens.length} 个屏幕`);
  }, [screens, stageWidth, stageHeight, error]);

  if (error) {
    console.warn('[WebGL 背景层] 启用兼容路径:', error);
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

export default WebGLBackgroundLayer;
