import React from 'react';
import ReactDOM from 'react-dom/client';
import '@unocss/reset/tailwind.css';
import '@shared/styles/index.css';
import 'uno.css';
import '@shared/i18n';
import { initStores } from '@shared/store';
import App from './App';

initStores();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
