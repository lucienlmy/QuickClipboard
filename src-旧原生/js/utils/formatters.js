// 通用工具函数

// HTML转义函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 格式化日期时间为可读的格式
function formatTimestamp(createdAt) {
  // 处理不同的输入格式
  let date;
  if (typeof createdAt === 'string') {
    // 如果是字符串格式的日期时间（如：2025-08-05 15:31:32）
    date = new Date(createdAt);
  } else if (typeof createdAt === 'number') {
    // 如果是Unix时间戳
    date = new Date(createdAt * 1000);
  } else {
    // 无效输入，返回空字符串
    return '';
  }

  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // 如果是今天
  if (diffDays === 0) {
    return '今天 ' + date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  // 如果是昨天
  else if (diffDays === 1) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  // 如果是一周内
  else if (diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[date.getDay()] + ' ' + date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  // 如果是今年
  else if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    }) + ' ' + date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  // 其他情况显示完整日期
  else {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }) + ' ' + date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
}

// 导出函数供其他模块使用
export { escapeHtml, formatTimestamp };
