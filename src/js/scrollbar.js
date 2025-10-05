// 自定义外置滚动条（不占用内容空间，悬浮容器时显示）

function createExternalScrollbar(container) {
  if (!container) return null;

  // 已存在则复用
  const existing = container.querySelector('.external-scrollbar');
  if (existing) return existing;

  const scrollbar = document.createElement('div');
  scrollbar.className = 'external-scrollbar';

  const track = document.createElement('div');
  track.className = 'external-scrollbar__track';

  const thumb = document.createElement('div');
  thumb.className = 'external-scrollbar__thumb';

  track.appendChild(thumb);
  scrollbar.appendChild(track);
  container.appendChild(scrollbar);

  return scrollbar;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateThumbPosition(container, thumb) {
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;
  const scrollTop = container.scrollTop;

  if (scrollHeight <= clientHeight) {
    thumb.style.display = 'none';
    return;
  }
  thumb.style.display = 'block';

  const trackHeight = container.offsetHeight - 4;
  const thumbHeight = Math.max((clientHeight / scrollHeight) * trackHeight, 20);
  const maxThumbTop = trackHeight - thumbHeight;
  const thumbTop = clamp((scrollTop / (scrollHeight - clientHeight)) * maxThumbTop, 0, maxThumbTop);

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.top = `${thumbTop}px`; 
}

function bindScrollbar(container) {
  const scrollbar = createExternalScrollbar(container);
  const thumb = scrollbar.querySelector('.external-scrollbar__thumb');

  // 初始化位置
  updateThumbPosition(container, thumb);

  let isDragging = false;
  let dragStartY = 0;
  let startScrollTop = 0;

  const onScroll = () => updateThumbPosition(container, thumb);
  const onResize = () => updateThumbPosition(container, thumb);

  container.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  // 拖动滚动
  thumb.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartY = e.clientY;
    startScrollTop = container.scrollTop;
    scrollbar.classList.add('dragging');
    document.body.classList.add('no-select');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const trackHeight = container.offsetHeight - 4;
    const thumbHeight = Math.max((clientHeight / scrollHeight) * trackHeight, 20);
    const maxThumbTop = trackHeight - thumbHeight;
    const deltaY = e.clientY - dragStartY;
    const scrollRatio = (scrollHeight - clientHeight) / maxThumbTop;
    container.scrollTop = startScrollTop + deltaY * scrollRatio;
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    scrollbar.classList.remove('dragging');
    document.body.classList.remove('no-select');
  });

  // 点击轨道跳转
  scrollbar.addEventListener('mousedown', (e) => {
    if (e.target !== scrollbar && !e.target.classList.contains('external-scrollbar__track')) return;
    const rect = scrollbar.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const trackHeight = container.offsetHeight - 4;
    const thumbHeight = Math.max((clientHeight / scrollHeight) * trackHeight, 20);
    const maxThumbTop = trackHeight - thumbHeight;
    const targetThumbTop = clamp(clickY - thumbHeight / 2, 0, maxThumbTop);
    const scrollRatio = (scrollHeight - clientHeight) / maxThumbTop;
    container.scrollTop = targetThumbTop * scrollRatio;
    // 立即进入拖动状态，无需先松开再按
    isDragging = true;
    dragStartY = e.clientY;
    startScrollTop = container.scrollTop;
    scrollbar.classList.add('dragging');
    document.body.classList.add('no-select');
    e.preventDefault();
  });

  // MutationObserver：内容变化时更新
  const mo = new MutationObserver(() => updateThumbPosition(container, thumb));
  mo.observe(container, { childList: true, subtree: true });

  // 公开刷新方法
  return () => updateThumbPosition(container, thumb);
}

export function initExternalScrollbars() {
  const containers = [
    document.getElementById('clipboard-list'),
    document.getElementById('quick-texts-list')
  ].filter(Boolean);

  const refreshers = containers.map((el) => bindScrollbar(el));

  // 初始与下一帧各刷新一次（确保布局完成）
  requestAnimationFrame(() => refreshers.forEach((r) => r && r()));
  setTimeout(() => refreshers.forEach((r) => r && r()), 50);

  // 提供全局刷新钩子（列表渲染后可调用）
  window.refreshExternalScrollbars = () => refreshers.forEach((r) => r && r());
}


