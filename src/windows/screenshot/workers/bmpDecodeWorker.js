self.onmessage = async (event) => {
  const { id, rawUrl, width, height } = event.data || {};

  if (typeof id === 'undefined') {
    return;
  }

  try {
    if (!rawUrl || !width || !height) {
      throw new Error('未提供原始像素数据源');
    }

    const t0 = performance.now();
    const response = await fetch(rawUrl, { cache: 'no-store' });
    const t1 = performance.now();
    
    if (!response.ok) {
      throw new Error(`获取像素数据失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const contentLength = +response.headers.get('Content-Length');
    const buffer = new Uint8Array(contentLength);
    let offset = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer.set(value, offset);
      offset += value.length;
    }
    const t2 = performance.now();
    
    // BGRA -> RGBA 
    const rgba = new Uint8ClampedArray(buffer.length);
    for (let i = 0; i < buffer.length; i += 4) {
      rgba[i] = buffer[i + 2];     // R <- B
      rgba[i + 1] = buffer[i + 1]; // G
      rgba[i + 2] = buffer[i];     // B <- R
      rgba[i + 3] = buffer[i + 3]; // A
    }
    const t3 = performance.now();
    
    const imageData = new ImageData(rgba, width, height);
    const bitmap = await createImageBitmap(imageData);
    const t4 = performance.now();
    
    self.postMessage({ id, success: true, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ id, success: false, error: error?.message || String(error) });
  }
};
