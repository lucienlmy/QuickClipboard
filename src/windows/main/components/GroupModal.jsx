import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX } from '@tabler/icons-react'
import { addGroup, updateGroup } from '@shared/store/groupsStore'
import { AVAILABLE_ICONS, getIconComponent } from '@shared/utils/iconMapper'

function GroupModal({ group, onClose, onSave }) {
  const { t } = useTranslation()
  const [name, setName] = useState(group?.name || '')
  const [selectedIcon, setSelectedIcon] = useState(group?.icon || 'ti ti-folder')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setSelectedIcon(group.icon)
    }
  }, [group])

  // 处理保存
  const handleSave = async () => {
    const trimmedName = name.trim()
    
    if (!trimmedName) {
      alert(t('groups.modal.nameRequired'))
      return
    }

    setSaving(true)
    try {
      if (group) {
        // 更新分组
        await updateGroup(group.name, trimmedName, selectedIcon)
      } else {
        // 新增分组
        await addGroup(trimmedName, selectedIcon)
      }
      
      if (onSave) {
        onSave()
      }
    } catch (error) {
      console.error('保存分组失败:', error)
      alert(t('groups.deleteFailed'))
    } finally {
      setSaving(false)
    }
  }

  // 处理键盘事件
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // 点击遮罩关闭
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {group ? t('groups.modal.titleEdit') : t('groups.modal.titleNew')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 分组名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('groups.modal.nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('groups.modal.namePlaceholder')}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* 图标选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('groups.modal.iconLabel')}
            </label>
            <div className="grid grid-cols-8 gap-2 max-h-[300px] overflow-y-auto p-2 bg-gray-50 dark:bg-gray-900 rounded-md">
              {AVAILABLE_ICONS.map(iconName => {
                const IconComponent = getIconComponent(iconName)
                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={`p-3 rounded-md transition-all ${
                      selectedIcon === iconName
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title={iconName}
                  >
                    <IconComponent size={20} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('groups.modal.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default GroupModal

