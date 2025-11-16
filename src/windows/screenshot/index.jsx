import React from 'react';
import ReactDOM from 'react-dom/client';

// 样式：按正确顺序导入
import '@unocss/reset/tailwind.css';
import '@shared/styles/index.css';
import 'uno.css';

// 初始化
import '@shared/i18n';

// 组件
import App from './App';
ReactDOM.createRoot(document.getElementById('root')).render(<App />);