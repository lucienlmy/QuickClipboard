self.onmessage = async (event) => {
  const { id, rawUrl, width, height } = event.data || {};

  if (typeof id === 'undefined') {
    return;
  }

  try {
    if (!rawUrl || !width || !height) {
      throw new Error('未提供原始像素数据源');
    }

    const response = await fetch(rawUrl, { cache: 'no-store' });

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

    const rgba = new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.length);

    const imageData = new ImageData(rgba, width, height);
    const bitmap = await createImageBitmap(imageData);

    self.postMessage({ id, success: true, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ id, success: false, error: error?.message || String(error) });
  }
};
