import { useEffect, useRef, useCallback, memo, useState } from 'react';

const MAX_CHUNK_HEIGHT = 4096;

const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const fragmentShaderSource = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
void main() {
  gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;

function createGLChunk(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = 'auto';

  const gl = canvas.getContext('webgl', {
    preserveDrawingBuffer: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vertexShaderSource);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragmentShaderSource);
  gl.compileShader(fs);

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  const vertices = new Float32Array([
    -1, -1, 0, 1,  1, -1, 1, 1,  -1, 1, 0, 0,
    -1, 1, 0, 0,  1, -1, 1, 1,  1, 1, 1, 0,
  ]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  const texLoc = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(posLoc);
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);

  return { canvas, gl, texture, program, buffer, width, height };
}

function destroyGLChunk(chunk) {
  if (!chunk || !chunk.gl) return;
  const { gl, texture, buffer, program } = chunk;
  gl.deleteTexture(texture);
  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);
}

function parseHeader(buffer) {
  if (buffer.byteLength < 17) return null;
  const view = new DataView(buffer);
  const type = view.getUint8(0);
  const width = view.getUint32(1, true);
  const height = view.getUint32(5, true);
  const startRow = view.getUint32(9, true);
  const sendHeight = view.getUint32(13, true);
  const data = new Uint8Array(buffer, 17);
  return { type, width, height, startRow, sendHeight, data };
}

function LongScreenshotPreview({ wsPort, onLoad, onMouseEnter, onMouseMove, onMouseLeave, onContextMenu, onImageReady, onRealtimeData, onStitchDirectionChange }) {
  const containerRef = useRef(null);
  const chunksRef = useRef([]);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const [canvasReady, setCanvasReady] = useState(false);
  const wsRef = useRef(null);
  const accumulatedDataRef = useRef(null);
  const callbacksRef = useRef({ onLoad, onImageReady, onRealtimeData, onStitchDirectionChange });

  useEffect(() => {
    callbacksRef.current = { onLoad, onImageReady, onRealtimeData, onStitchDirectionChange };
  }, [onLoad, onImageReady, onRealtimeData]);

  useEffect(() => {
    if (containerRef.current) setCanvasReady(true);
  }, []);

  const ensureChunks = useCallback((width, totalHeight) => {
    const container = containerRef.current;
    if (!container) return false;

    const numChunks = Math.ceil(totalHeight / MAX_CHUNK_HEIGHT);
    const chunks = chunksRef.current;
    let hasNewChunks = false;

    while (chunks.length > numChunks) {
      const chunk = chunks.pop();
      if (chunk.canvas.parentNode) chunk.canvas.parentNode.removeChild(chunk.canvas);
      destroyGLChunk(chunk);
    }

    for (let i = 0; i < numChunks; i++) {
      const startY = i * MAX_CHUNK_HEIGHT;

      if (i < chunks.length) {
        const chunk = chunks[i];
        if (chunk.width !== width) {
          if (chunk.canvas.parentNode) chunk.canvas.parentNode.removeChild(chunk.canvas);
          destroyGLChunk(chunk);
          const newChunk = createGLChunk(width, MAX_CHUNK_HEIGHT);
          if (newChunk) {
            newChunk.startY = startY;
            container.appendChild(newChunk.canvas);
            chunks[i] = newChunk;
            hasNewChunks = true;
          }
        } else {
          chunk.startY = startY;
        }
      } else {
        const newChunk = createGLChunk(width, MAX_CHUNK_HEIGHT);
        if (newChunk) {
          newChunk.startY = startY;
          container.appendChild(newChunk.canvas);
          chunks.push(newChunk);
          hasNewChunks = true;
        }
      }
    }
    return hasNewChunks;
  }, []);

  const renderToChunks = useCallback((rgba, width, totalHeight, startRow, sendHeight) => {
    const chunks = chunksRef.current;

    for (const chunk of chunks) {
      const { gl, texture, startY, height } = chunk;
      if (!gl) continue;

      const chunkEndY = startY + height;
      const updateEndY = startRow + sendHeight;

      if (updateEndY <= startY || startRow >= chunkEndY) continue;

      const intersectStart = Math.max(startY, startRow);
      const intersectEnd = Math.min(chunkEndY, updateEndY, totalHeight);
      const intersectHeight = intersectEnd - intersectStart;

      if (intersectHeight <= 0) continue;

      const chunkOffsetY = intersectStart - startY;
      const srcOffsetY = intersectStart;
      const startByte = srcOffsetY * width * 4;
      const byteLength = intersectHeight * width * 4;

      if (startByte + byteLength <= rgba.length) {
        const subData = new Uint8Array(rgba.buffer, rgba.byteOffset + startByte, byteLength);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, chunkOffsetY, width, intersectHeight, gl.RGBA, gl.UNSIGNED_BYTE, subData);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
  }, []);

  useEffect(() => {
    if (!wsPort || !canvasReady) return;

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const parsed = parseHeader(event.data);
      if (!parsed) return;

      const isInsertAtTop = parsed.type === 0x81;
      const isPreview = parsed.type === 0x01 || parsed.type === 0x81;
      if (isPreview) {
        const { width: imgWidth, height: totalHeight, startRow, sendHeight, data: receivedData } = parsed;
        
        if (imgWidth <= 0 || totalHeight <= 0) return;
        callbacksRef.current.onStitchDirectionChange?.(isInsertAtTop);

        const rowBytes = imgWidth * 4;
        let currentAcc = accumulatedDataRef.current;

        if (startRow === 0 && !isInsertAtTop) {
          accumulatedDataRef.current = { 
            data: new Uint8Array(receivedData), 
            width: imgWidth, 
            height: totalHeight 
          };
          currentAcc = accumulatedDataRef.current;
        } else if (currentAcc && currentAcc.width === imgWidth) {
          const newTotalBytes = totalHeight * rowBytes;
          
          if (isInsertAtTop) {
            const newData = new Uint8Array(newTotalBytes);
            newData.set(receivedData, 0);
            if (currentAcc.data.length > 0) {
              newData.set(currentAcc.data, sendHeight * rowBytes);
            }
            accumulatedDataRef.current = { data: newData, width: imgWidth, height: totalHeight };
            currentAcc = accumulatedDataRef.current;
          } else if (newTotalBytes > currentAcc.data.length) {
            const newData = new Uint8Array(newTotalBytes);
            newData.set(currentAcc.data);
            newData.set(receivedData, startRow * rowBytes);
            accumulatedDataRef.current = { data: newData, width: imgWidth, height: totalHeight };
            currentAcc = accumulatedDataRef.current;
          } else {
            currentAcc.data.set(receivedData, startRow * rowBytes);
            currentAcc.height = totalHeight;
          }
        } else {
          accumulatedDataRef.current = { 
            data: new Uint8Array(receivedData), 
            width: imgWidth, 
            height: totalHeight 
          };
          currentAcc = accumulatedDataRef.current;
        }

        const prevChunkCount = chunksRef.current.length;
        const sizeChanged = lastSizeRef.current.width !== imgWidth || lastSizeRef.current.height !== totalHeight;
        if (sizeChanged) {
          ensureChunks(imgWidth, totalHeight);
          lastSizeRef.current = { width: imgWidth, height: totalHeight };
        }
        const chunksAdded = chunksRef.current.length > prevChunkCount;

        if (startRow === 0 || chunksAdded) {
          renderToChunks(currentAcc.data, imgWidth, totalHeight, 0, totalHeight);
        } else {
          renderToChunks(currentAcc.data, imgWidth, totalHeight, startRow, sendHeight);
        }

        const container = containerRef.current;
        if (container) {
          const displayWidth = 216;
          const displayHeight = Math.round(displayWidth * totalHeight / imgWidth);
          container.style.width = `${displayWidth}px`;
          container.style.height = `${displayHeight}px`;
        }

        const displayWidth = 216;
        const displayHeight = Math.round(displayWidth * totalHeight / imgWidth);
        callbacksRef.current.onLoad?.({ width: displayWidth, height: displayHeight, naturalWidth: imgWidth, naturalHeight: totalHeight });
        callbacksRef.current.onImageReady?.({ chunks: chunksRef.current, width: imgWidth, height: totalHeight, data: currentAcc.data });

      } else if (parsed.type === 0x02) {
        if (parsed.width === 0 || parsed.height === 0) {
          callbacksRef.current.onRealtimeData?.(null);
        } else {
          callbacksRef.current.onRealtimeData?.({ width: parsed.width, height: parsed.height, data: parsed.data });
        }
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [wsPort, canvasReady, ensureChunks, renderToChunks]);

  useEffect(() => {
    return () => {
      chunksRef.current.forEach(chunk => {
        if (chunk.canvas.parentNode) chunk.canvas.parentNode.removeChild(chunk.canvas);
        destroyGLChunk(chunk);
      });
      chunksRef.current = [];
      accumulatedDataRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-auto block"
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
    />
  );
}

export default memo(LongScreenshotPreview);
