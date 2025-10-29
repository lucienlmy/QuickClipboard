import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shared/i18n'
import 'virtual:uno.css'
import '@unocss/reset/tailwind.css'
import '@shared/styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

