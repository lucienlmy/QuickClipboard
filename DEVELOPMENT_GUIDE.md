# QuickClipboard 开发规范

本文档定义了 QuickClipboard React 版本的开发规范和最佳实践。**所有开发者必须严格遵守这些规范。**

---

## 📋 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [编码规范](#编码规范)
- [样式规范](#样式规范)
- [组件开发规范](#组件开发规范)
- [国际化规范](#国际化规范)
- [状态管理规范](#状态管理规范)
- [命名规范](#命名规范)
- [Git 提交规范](#git-提交规范)

---

## 🛠️ 技术栈

### 必须使用的技术栈

| 技术 | 版本 | 用途 | 备注 |
|------|------|------|------|
| **React** | 19.x | 前端框架 | 必须使用函数组件和 Hooks |
| **UnoCSS** | 最新 | 原子化 CSS | **禁止使用内联样式和传统 CSS** |
| **Radix UI** | 最新 | 无样式组件库 | UI 组件必须基于 Radix UI |
| **react-i18next** | 最新 | 国际化 | **所有文本必须国际化** |
| **@tabler/icons-react** | 最新 | 图标库 | **禁止使用其他图标库** |
| **Vite** | 7.x | 构建工具 | - |
| **Tauri** | 2.x | 桌面应用框架 | - |

### 禁止使用的技术

- ❌ 任何 CSS-in-JS 库（styled-components, emotion 等）
- ❌ Bootstrap、Ant Design、Material-UI 等 UI 框架
- ❌ jQuery 或其他 DOM 操作库
- ❌ 内联样式 `style={{ ... }}`
- ❌ 传统 CSS 文件（除全局样式外）

---

## 📁 项目结构

```
src/
├── assets/              # 静态资源
│   ├── images/         # 图片
│   ├── fonts/          # 字体
│   └── icons/          # 本地图标
├── components/          # 公共可复用组件
│   ├── ui/             # 基础 UI 组件（基于 Radix UI 封装）
│   ├── layout/         # 布局组件
│   └── common/         # 通用业务组件
├── features/            # 功能模块（按业务划分）
│   ├── clipboard/      # 剪贴板功能
│   ├── screenshot/     # 截图功能
│   ├── settings/       # 设置功能
│   └── ...
├── hooks/               # 自定义 Hooks
│   ├── useClipboard.js
│   ├── useTheme.js
│   └── ...
├── services/            # API 和后端交互
│   ├── tauri.js        # Tauri API 封装
│   ├── clipboard.js    # 剪贴板服务
│   └── ...
├── store/               # 状态管理
│   ├── clipboardStore.js
│   ├── settingsStore.js
│   └── index.js
├── utils/               # 工具函数
│   ├── format.js       # 格式化工具
│   ├── validate.js     # 验证工具
│   └── ...
├── styles/              # 全局样式
│   └── index.css       # 全局样式
├── locales/             # 国际化语言包
│   ├── zh-CN.json      # 简体中文
│   ├── en-US.json      # 英文
│   └── ...
├── routes/              # 路由配置（如需要）
├── i18n.js             # i18n 配置
├── App.jsx             # 根组件
└── index.jsx           # 入口文件
```

### 目录规范

1. **每个功能模块独立一个文件夹**
   ```
   features/clipboard/
   ├── index.jsx              # 导出组件
   ├── ClipboardList.jsx      # 列表组件
   ├── ClipboardItem.jsx      # 列表项组件
   ├── useClipboardData.js    # 专属 Hook
   └── clipboardUtils.js      # 工具函数
   ```

2. **组件文件名使用 PascalCase**
   - ✅ `ClipboardList.jsx`
   - ❌ `clipboardList.jsx`
   - ❌ `clipboard-list.jsx`

3. **工具文件和 Hook 使用 camelCase**
   - ✅ `useClipboard.js`
   - ✅ `formatDate.js`
   - ❌ `UseClipboard.js`

---

## 💻 编码规范

### 1. 组件规范

#### ✅ 必须遵守

```jsx
// ✅ 正确：函数组件 + Hooks
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

function ClipboardItem({ item, onDelete }) {
  const { t } = useTranslation()
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
      <p>{item.content}</p>
      <button onClick={() => onDelete(item.id)}>
        {t('common.delete')}
      </button>
    </div>
  )
}

export default ClipboardItem
```

#### ❌ 禁止

```jsx
// ❌ 错误：类组件
class ClipboardItem extends React.Component {
  render() {
    return <div>...</div>
  }
}

// ❌ 错误：内联样式
<div style={{ padding: '16px', backgroundColor: 'white' }}>

// ❌ 错误：硬编码文本
<button>删除</button>
```

### 2. 代码组织

#### 文件结构顺序

```jsx
// 1. Import 导入
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { IconX } from '@tabler/icons-react'

// 2. 类型定义（如使用 TypeScript）
// interface Props { ... }

// 3. 常量定义
const MAX_ITEMS = 100

// 4. 组件定义
function Component() {
  // 4.1 Hooks
  const { t } = useTranslation()
  const [state, setState] = useState(null)
  
  // 4.2 副作用
  useEffect(() => {
    // ...
  }, [])
  
  // 4.3 事件处理函数
  const handleClick = () => {
    // ...
  }
  
  // 4.4 渲染辅助函数
  const renderItem = (item) => {
    return <div key={item.id}>{item.name}</div>
  }
  
  // 4.5 渲染
  return (
    <div>...</div>
  )
}

// 5. 导出
export default Component
```

### 3. 模块化要求

#### ✅ 必须模块化

```jsx
// ✅ 正确：拆分成小组件
// ClipboardList.jsx
function ClipboardList({ items }) {
  return (
    <div className="space-y-2">
      {items.map(item => (
        <ClipboardItem key={item.id} item={item} />
      ))}
    </div>
  )
}

// ClipboardItem.jsx
function ClipboardItem({ item }) {
  return (
    <div className="card">
      <p>{item.content}</p>
    </div>
  )
}
```

#### ❌ 禁止

```jsx
// ❌ 错误：所有逻辑写在一个组件
function ClipboardList({ items }) {
  return (
    <div>
      {items.map(item => (
        <div key={item.id}>
          <div className="header">
            <h3>{item.title}</h3>
            <div className="actions">
              <button>Edit</button>
              <button>Delete</button>
            </div>
          </div>
          <div className="content">
            {/* 100+ 行代码 */}
          </div>
        </div>
      ))}
    </div>
  )
}
```

**规则：**
- 单个组件不超过 200 行
- 超过 50 行考虑拆分
- 重复代码必须提取

---

## 🎨 样式规范

### 1. 只使用 UnoCSS

#### ✅ 必须使用

```jsx
// ✅ 正确：UnoCSS 原子类
<div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
    Title
  </h3>
  <button className="btn-primary">
    Click
  </button>
</div>
```

#### ❌ 禁止

```jsx
// ❌ 错误：内联样式
<div style={{ display: 'flex', padding: '16px' }}>

// ❌ 错误：CSS Modules
import styles from './style.module.css'
<div className={styles.container}>

// ❌ 错误：CSS-in-JS
const StyledDiv = styled.div`
  padding: 16px;
`
```

### 2. UnoCSS 快捷方式

在 `uno.config.js` 中定义常用组合：

```javascript
shortcuts: {
  'btn': 'px-4 py-2 rounded cursor-pointer transition-all duration-200',
  'btn-primary': 'btn bg-blue-500 text-white hover:bg-blue-600',
  'btn-secondary': 'btn bg-gray-500 text-white hover:bg-gray-600',
  'card': 'bg-white dark:bg-gray-800 rounded-lg shadow-md p-4',
  'input': 'px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
}
```

### 3. 响应式设计

```jsx
// ✅ 使用响应式前缀
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* ... */}
</div>

// 文字大小
<h1 className="text-2xl md:text-3xl lg:text-4xl">
  Title
</h1>
```

### 4. 深色模式

```jsx
// ✅ 始终考虑深色模式
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
  Content
</div>
```

---

## 🧩 组件开发规范

### 1. 使用 Radix UI 基础组件

#### ✅ 必须基于 Radix UI

```jsx
import * as Dialog from '@radix-ui/react-dialog'
import { IconX } from '@tabler/icons-react'

function ConfirmDialog({ open, onOpenChange, onConfirm }) {
  const { t } = useTranslation()
  
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg p-6 w-96">
          <Dialog.Title className="text-lg font-semibold mb-4">
            {t('dialog.confirm')}
          </Dialog.Title>
          <Dialog.Description className="text-gray-600 dark:text-gray-400 mb-6">
            {t('dialog.confirmMessage')}
          </Dialog.Description>
          <div className="flex justify-end gap-3">
            <Dialog.Close asChild>
              <button className="btn-secondary">
                {t('common.cancel')}
              </button>
            </Dialog.Close>
            <button className="btn-primary" onClick={onConfirm}>
              {t('common.confirm')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### 2. 组件封装原则

```jsx
// components/ui/Button.jsx
function Button({ children, variant = 'primary', icon, ...props }) {
  const className = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
  
  return (
    <button className={`${className} flex items-center gap-2`} {...props}>
      {icon}
      {children}
    </button>
  )
}

// 使用
<Button variant="primary" icon={<IconPlus />} onClick={handleClick}>
  {t('common.add')}
</Button>
```

---

## 🌍 国际化规范

### 1. 严格要求

**⚠️ 绝对禁止硬编码任何用户可见文本！**

#### ✅ 正确

```jsx
import { useTranslation } from 'react-i18next'

function Component() {
  const { t } = useTranslation()
  
  return (
    <div>
      <h1>{t('app.title')}</h1>
      <p>{t('app.description')}</p>
      <button>{t('common.save')}</button>
    </div>
  )
}
```

#### ❌ 错误

```jsx
// ❌ 禁止：硬编码中文
<button>保存</button>

// ❌ 禁止：硬编码英文
<button>Save</button>

// ❌ 禁止：注释中的硬编码也要避免
<button>{t('common.save')}</button> {/* 保存按钮 */}
```

### 2. 翻译文件组织

```json
// locales/zh-CN.json
{
  "common": {
    "save": "保存",
    "cancel": "取消",
    "delete": "删除",
    "edit": "编辑",
    "confirm": "确认"
  },
  "clipboard": {
    "title": "剪贴板历史",
    "empty": "暂无剪贴板记录",
    "copySuccess": "复制成功"
  },
  "settings": {
    "title": "设置",
    "general": "通用",
    "appearance": "外观"
  }
}
```

### 3. 翻译 Key 命名规范

```
模块.功能.具体内容

✅ clipboard.list.empty
✅ settings.theme.dark
✅ error.network.timeout

❌ clipboardListEmpty
❌ darkTheme
❌ error1
```

### 4. 动态翻译

```jsx
// ✅ 带变量的翻译
const { t } = useTranslation()

// locales/zh-CN.json: "itemCount": "共 {{count}} 项"
<p>{t('itemCount', { count: items.length })}</p>

// 复数形式
// locales/zh-CN.json: "items": "{{count}} 项", "items_plural": "{{count}} 项"
<p>{t('items', { count })}</p>
```

---

## 🗄️ 状态管理规范

### 1. 本地状态使用 useState

```jsx
function Component() {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '' })
  
  return (
    // ...
  )
}
```

### 2. 共享状态使用 Context

```jsx
// store/clipboardStore.js
import { createContext, useContext, useState } from 'react'

const ClipboardContext = createContext()

export function ClipboardProvider({ children }) {
  const [items, setItems] = useState([])
  
  const addItem = (item) => {
    setItems(prev => [item, ...prev])
  }
  
  return (
    <ClipboardContext.Provider value={{ items, addItem }}>
      {children}
    </ClipboardContext.Provider>
  )
}

export const useClipboard = () => useContext(ClipboardContext)
```

### 3. 复杂状态使用 useReducer

```jsx
const initialState = { items: [], loading: false, error: null }

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true }
    case 'LOAD_SUCCESS':
      return { items: action.payload, loading: false, error: null }
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.payload }
    default:
      return state
  }
}

function Component() {
  const [state, dispatch] = useReducer(reducer, initialState)
  // ...
}
```

---

## 📝 命名规范

### 1. 变量命名

```javascript
// ✅ 布尔值：is/has/can/should 开头
const isOpen = true
const hasError = false
const canEdit = true
const shouldUpdate = false

// ✅ 数组：复数形式
const items = []
const users = []
const clipboardEntries = []

// ✅ 函数：动词开头
const handleClick = () => {}
const fetchData = async () => {}
const calculateTotal = () => {}

// ❌ 避免
const open = true  // 应该用 isOpen
const item = []    // 应该用 items
const click = () => {}  // 应该用 handleClick
```

### 2. 事件处理函数

```javascript
// ✅ 使用 handle 前缀
const handleClick = () => {}
const handleSubmit = () => {}
const handleInputChange = () => {}

// ✅ 回调函数使用 on 前缀
<Component onClick={handleClick} />
<Component onSubmit={handleSubmit} />
```

### 3. 常量命名

```javascript
// ✅ 全大写 + 下划线
const MAX_ITEMS = 100
const API_BASE_URL = 'https://api.example.com'
const DEFAULT_THEME = 'light'
```

---

## 📦 Git 提交规范

### Commit Message 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具变动

### 示例

```bash
feat(clipboard): 添加剪贴板历史搜索功能

- 实现搜索框组件
- 添加过滤逻辑
- 更新国际化文件

Closes #123
```

```bash
fix(settings): 修复深色模式切换问题

修复了切换深色模式时部分组件样式不更新的问题
```

---

## ✅ 代码检查清单

提交代码前必须检查：

- [ ] 所有文本都使用了 `t()` 国际化
- [ ] 没有使用内联样式
- [ ] 所有样式使用 UnoCSS 类名
- [ ] UI 组件基于 Radix UI
- [ ] 图标使用 @tabler/icons-react
- [ ] 组件已适当拆分（<200 行）
- [ ] 添加了深色模式支持
- [ ] 响应式设计已考虑
- [ ] 命名符合规范
- [ ] 代码已格式化

---

## 🚫 常见错误

### 1. 硬编码文本

```jsx
// ❌ 错误
<button>保存</button>
<h1>QuickClipboard</h1>

// ✅ 正确
<button>{t('common.save')}</button>
<h1>{t('app.title')}</h1>
```

### 2. 使用内联样式

```jsx
// ❌ 错误
<div style={{ padding: 16, backgroundColor: 'white' }}>

// ✅ 正确
<div className="p-4 bg-white dark:bg-gray-800">
```

### 3. 组件过大

```jsx
// ❌ 错误：一个组件 500 行
function ClipboardPage() {
  // 500 行代码...
}

// ✅ 正确：拆分成多个组件
function ClipboardPage() {
  return (
    <div>
      <ClipboardHeader />
      <ClipboardList />
      <ClipboardFooter />
    </div>
  )
}
```

---

## 📚 参考资源

- [React 官方文档](https://react.dev/)
- [UnoCSS 文档](https://unocss.dev/)
- [Radix UI 文档](https://www.radix-ui.com/)
- [react-i18next 文档](https://react.i18next.com/)
- [Tabler Icons](https://tabler.io/icons)

---

**最后更新：** 2025-10-29

**版本：** 1.0.0

