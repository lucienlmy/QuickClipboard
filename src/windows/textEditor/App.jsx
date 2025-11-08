import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { settingsStore, initSettings } from '@shared/store/settingsStore'
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme'
import { useSettingsSync } from '@shared/hooks/useSettingsSync'
import {
  getClipboardItemById,
  getFavoriteItemById,
  updateClipboardItem,
  updateFavorite,
  addFavorite,
  getGroups
} from '@shared/api'
import TitleBar from './components/TitleBar'
import EditorToolbar from './components/EditorToolbar'
import TextEditor from './components/TextEditor'
import StatusBar from './components/StatusBar'
import ToastContainer from '@shared/components/common/ToastContainer'

function App() {
  const { t } = useTranslation()
  const { theme } = useSnapshot(settingsStore)
  const { isDark, effectiveTheme } = useTheme()
  const [editorData, setEditorData] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [originalTitle, setOriginalTitle] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [charCount, setCharCount] = useState(0)
  const [lineCount, setLineCount] = useState(1)
  const [wordWrap, setWordWrap] = useState(true)
  const [language, setLanguage] = useState('plaintext')
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('全部')

  useSettingsSync()

  useEffect(() => {
    const init = async () => {
      await initSettings()
      const editorTheme = settingsStore.theme === 'background' ? 'light' : settingsStore.theme
      applyThemeToBody(editorTheme, 'text-editor')
    }
    init()
  }, [])

  useEffect(() => {
    const editorTheme = theme === 'background' ? 'light' : theme
    applyThemeToBody(editorTheme, 'text-editor')
  }, [theme, effectiveTheme])

  // 加载分组列表
  useEffect(() => {
    const loadGroupList = async () => {
      try {
        const groupList = await getGroups()
        setGroups(groupList)
      } catch (error) {
      }
    }
    loadGroupList()
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        // 获取 URL 参数
        const params = new URLSearchParams(window.location.search)
        const id = params.get('id')
        const type = params.get('type')
        const index = params.get('index')

        if (!id || !type) {
          return
        }

        // 新建收藏项
        if (id === '-1' && type === 'favorite') {
          setEditorData({ id: null, type: 'favorite', groupId: null })
          setTitle('')
          setOriginalTitle('')
          setContent('')
          setOriginalContent('')
          return
        }

        // 调用后端 API 获取数据
        if (type === 'clipboard') {
          const numericId = parseInt(id)
          const item = await getClipboardItemById(numericId)

          const displayTitle = t('textEditor.clipboardItem', { number: parseInt(index) })
          setEditorData({ id: item.id, type: 'clipboard', index: parseInt(index) })
          setTitle(displayTitle)
          setOriginalTitle(displayTitle)
          setContent(item.content || '')
          setOriginalContent(item.content || '')
        } else if (type === 'favorite') {
          const item = await getFavoriteItemById(id)

          setEditorData({
            id: item.id,
            type: 'favorite',
            groupId: item.group_name || null
          })
          setTitle(item.title || '')
          setOriginalTitle(item.title || '')
          setContent(item.content || '')
          setOriginalContent(item.content || '')
          setSelectedGroup(item.group_name || '全部')
        }
      } catch (error) {
      }
    }

    loadData()
  }, [t])

  // 检查是否有未保存的更改
  useEffect(() => {
    const contentChanged = content !== originalContent
    const titleChanged = editorData?.type === 'favorite' && title !== originalTitle
    setHasChanges(contentChanged || titleChanged)
  }, [content, originalContent, title, originalTitle, editorData])

  const handleSave = async () => {
    if (!editorData) return

    try {
      if (editorData.type === 'clipboard') {
        await updateClipboardItem(editorData.id, content)
      } else if (editorData.type === 'favorite') {
        if (editorData.id) {
          await updateFavorite(editorData.id, title, content, selectedGroup)
        } else {
          await addFavorite(title || t('textEditor.clipboardItem', { number: 1 }), content, selectedGroup)
        }
      }

      setOriginalContent(content)
      setOriginalTitle(title)
      setHasChanges(false)

      const { Window } = await import('@tauri-apps/api/window')
      const currentWindow = Window.getCurrent()
      await currentWindow.close()
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  const handleCancel = async () => {
    const { Window } = await import('@tauri-apps/api/window')
    const currentWindow = Window.getCurrent()
    await currentWindow.close()
  }

  // 处理重置
  const handleReset = () => {
    setContent(originalContent)
  }

  const containerClasses = `
    h-screen w-screen
    flex flex-col
    bg-white dark:bg-gray-900
    ${isDark ? 'dark' : ''}
  `.trim().replace(/\s+/g, ' ')

  return (
    <div className={containerClasses}>
      <TitleBar
        title={title}
        hasChanges={hasChanges}
      />

      <EditorToolbar
        onReset={handleReset}
        title={title}
        onTitleChange={setTitle}
        wordWrap={wordWrap}
        onWordWrapChange={() => setWordWrap(!wordWrap)}
        language={language}
        onLanguageChange={setLanguage}
        showTitle={editorData?.type === 'favorite'}
        groups={groups}
        selectedGroup={selectedGroup}
        onGroupChange={setSelectedGroup}
        showGroupSelector={editorData?.type === 'favorite'}
      />

      <TextEditor
        content={content}
        onContentChange={setContent}
        onStatsChange={({ chars, lines }) => {
          setCharCount(chars)
          setLineCount(lines)
        }}
        wordWrap={wordWrap}
        language={language}
      />

      <StatusBar
        charCount={charCount}
        lineCount={lineCount}
        hasChanges={hasChanges}
        onSave={handleSave}
        onCancel={handleCancel}
      />

      <ToastContainer />
    </div>
  )
}

export default App

