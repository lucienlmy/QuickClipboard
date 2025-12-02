const BMP_MIME = 'image/bmp';

self.onmessage = async (event) => {
  const { id, url, buffer } = event.data || {};

  if (typeof id === 'undefined') {
    return;
  }

  try {
    let arrayBuffer = buffer;

    if (!arrayBuffer) {
      if (!url) {
        throw new Error('未提供BMP源');
      }
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`获取BMP失败: ${response.status}`);
      }
      arrayBuffer = await response.arrayBuffer();
    }

    if (typeof createImageBitmap !== 'function') {
      throw new Error('createImageBitmap 不可用');
    }

    const blob = new Blob([arrayBuffer], { type: BMP_MIME });
    const bitmap = await createImageBitmap(blob);
    self.postMessage({ id, success: true, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ id, success: false, error: error?.message || String(error) });
  }
};
