import { useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { updateMousePosition } from '../store/mouseStore';

export default function useCursorMovement(screens, magnifierUpdateRef, stageRegionManager, { arrowKeyEnabled = true } = {}) {
  const pressedKeysRef = useRef(new Set());
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(0);
  const moveStartTimeRef = useRef(0);
  const moveAccumulatorRef = useRef(0); 
  
  const physicalPositionRef = useRef(null);
  const isKeyboardActiveRef = useRef(false);
  const ignoreMouseMoveUntilRef = useRef(0);

  const stageOffset = useMemo(() => {
    if (!screens || screens.length === 0) return { x: 0, y: 0, scale: 1 };
    const scale = window.devicePixelRatio || 1;
    return {
      x: screens[0].physicalX - screens[0].x * scale,
      y: screens[0].physicalY - screens[0].y * scale,
      scale
    };
  }, [screens]);

  const currentPosRef = useRef(null);

  // 更新光标位置（基于物理像素）
  const updateCursorPosition = (dx, dy, forceSync = false) => {
    const prev = currentPosRef.current;
    if (!prev) return;

      const { x: offsetX, y: offsetY, scale } = stageOffset;

      if (physicalPositionRef.current === null || forceSync) {
        physicalPositionRef.current = {
          x: Math.round(prev.x * scale + offsetX),
          y: Math.round(prev.y * scale + offsetY)
        };
      }
      
      const currentPhys = physicalPositionRef.current;
      let newPhysX = currentPhys.x + dx;
      let newPhysY = currentPhys.y + dy;

      // 应用边界限制
      if (stageRegionManager) {
        const tempX = (newPhysX - offsetX) / scale;
        const tempY = (newPhysY - offsetY) / scale;

        const constrainedRect = stageRegionManager.constrainRect({
          x: tempX, y: tempY, width: 0, height: 0
        });

        if (constrainedRect.x !== tempX || constrainedRect.y !== tempY) {
           newPhysX = Math.round(constrainedRect.x * scale + offsetX);
           newPhysY = Math.round(constrainedRect.y * scale + offsetY);
        }
      }
      
      physicalPositionRef.current = { x: newPhysX, y: newPhysY };
      
      invoke('set_mouse_position', { x: newPhysX, y: newPhysY });
      
      // 防止系统鼠标事件导致位置回弹
      isKeyboardActiveRef.current = true;
      ignoreMouseMoveUntilRef.current = performance.now() + 100;

      const newX = (newPhysX - offsetX) / scale;
      const newY = (newPhysY - offsetY) / scale;
      const newPos = { x: newX, y: newY };
      
      currentPosRef.current = newPos;
      updateMousePosition(newPos);
      magnifierUpdateRef.current?.(newPos);
  };

  // 初始化当前位置
  const initializePosition = useCallback((pos) => {
    if (!pos) return;
    
    const { x: offsetX, y: offsetY, scale } = stageOffset;
    physicalPositionRef.current = {
      x: Math.round(pos.x * scale + offsetX),
      y: Math.round(pos.y * scale + offsetY)
    };
    currentPosRef.current = pos;
    updateMousePosition(pos);
  }, [stageOffset]);

  // 代理鼠标移动事件
  const handleMouseMove = useCallback((e) => {
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;

    // 键盘操作期间忽略鼠标事件
    if (isKeyboardActiveRef.current || performance.now() < ignoreMouseMoveUntilRef.current) {
      return;
    }

    const { x: offsetX, y: offsetY, scale } = stageOffset;
    physicalPositionRef.current = {
      x: Math.round(pos.x * scale + offsetX),
      y: Math.round(pos.y * scale + offsetY)
    };

    currentPosRef.current = pos;
    updateMousePosition(pos);
    magnifierUpdateRef.current?.(pos);
  }, [stageOffset, magnifierUpdateRef]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!arrowKeyEnabled) return;
      
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.repeat) return; 
        
        const key = e.key;
        if (!pressedKeysRef.current.has(key)) {
            pressedKeysRef.current.add(key);
            isKeyboardActiveRef.current = true;
            
            // 初始移动 1 物理像素
            let dx = 0, dy = 0;
            if (key === 'ArrowUp') dy = -1;
            if (key === 'ArrowDown') dy = 1;
            if (key === 'ArrowLeft') dx = -1;
            if (key === 'ArrowRight') dx = 1;
            
            updateCursorPosition(dx, dy, true);
            
            // 启动加速循环
            if (!animationFrameRef.current) {
                moveStartTimeRef.current = performance.now();
                lastTimeRef.current = performance.now();
                moveAccumulatorRef.current = 0;
                
                const loop = (time) => {
                    const now = time;
                    const duration = now - moveStartTimeRef.current;
                    const deltaTime = now - lastTimeRef.current;
                    lastTimeRef.current = now;

                    isKeyboardActiveRef.current = true;
                    ignoreMouseMoveUntilRef.current = now + 100;

                    // 400ms 后开始加速
                    if (duration > 400) {
                        let speed = 0.02; 
                        const rampUp = Math.min((duration - 400) / 1500, 1);
                        speed = 0.02 + rampUp * 0.78; // 20px/s -> 800px/s
                        
                        moveAccumulatorRef.current += speed * deltaTime;
                        const pixels = Math.floor(moveAccumulatorRef.current);
                        
                        if (pixels >= 1) {
                            moveAccumulatorRef.current -= pixels;
                            let loopDx = 0, loopDy = 0;
                            const keys = pressedKeysRef.current;
                            if (keys.has('ArrowUp')) loopDy -= pixels;
                            if (keys.has('ArrowDown')) loopDy += pixels;
                            if (keys.has('ArrowLeft')) loopDx -= pixels;
                            if (keys.has('ArrowRight')) loopDx += pixels;
                            
                            if (loopDx !== 0 || loopDy !== 0) {
                                updateCursorPosition(loopDx, loopDy);
                            }
                        }
                    }
                    
                    if (pressedKeysRef.current.size > 0) {
                        animationFrameRef.current = requestAnimationFrame(loop);
                    } else {
                        animationFrameRef.current = null;
                    }
                };
                animationFrameRef.current = requestAnimationFrame(loop);
            }
        }
      }
    };

    const handleKeyUp = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        pressedKeysRef.current.delete(e.key);
        if (pressedKeysRef.current.size === 0) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            // 延迟释放键盘控制权
            setTimeout(() => {
                if (pressedKeysRef.current.size === 0) {
                    isKeyboardActiveRef.current = false;
                }
            }, 150);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [stageOffset, arrowKeyEnabled]); 

  return { handleMouseMove, initializePosition };
}
