import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'
import ShortcutInput from '../components/ShortcutInput'
import { useShortcutStatuses } from '@shared/hooks/useShortcutStatuses'
import { useShortcutDuplicateCheck } from '@shared/hooks/useShortcutDuplicateCheck'

function ShortcutsSection({ settings, onSettingChange }) {
  const { t } = useTranslation()
  const { hasError: hasBackendError, getError: getBackendError, reload } = useShortcutStatuses()
  const { hasDuplicate, getDuplicateError } = useShortcutDuplicateCheck(settings)

  const handleShortcutChange = async (key, value) => {
    await onSettingChange(key, value)
    setTimeout(() => {
      reload()
    }, 150)
  }

  const getErrorMessage = (key, backendId) => {
    const duplicateError = getDuplicateError(key)
    const backendError = backendId ? getBackendError(backendId) : null
    
    if (duplicateError && backendError) {
      return `${duplicateError}；${backendError}`
    }
    return duplicateError || backendError
  }

  const hasErrorStatus = (key, backendId) => {
    return hasDuplicate(key) || (backendId && hasBackendError(backendId))
  }

  const numberModifierOptions = [
    { value: 'Ctrl', label: 'Ctrl + ' + t('settings.shortcuts.number') },
    { value: 'Alt', label: 'Alt + ' + t('settings.shortcuts.number') },
    { value: 'Shift', label: 'Shift + ' + t('settings.shortcuts.number') },
    { value: 'Ctrl+Shift', label: 'Ctrl + Shift + ' + t('settings.shortcuts.number') },
    { value: 'Ctrl+Alt', label: 'Ctrl + Alt + ' + t('settings.shortcuts.number') },
    { value: 'Alt+Shift', label: 'Alt + Shift + ' + t('settings.shortcuts.number') }
  ]

  const mouseModifierOptions = [
    { value: 'None', label: t('settings.shortcuts.mouseMiddleOnly') },
    { value: 'Ctrl', label: 'Ctrl + ' + t('settings.shortcuts.middleButton') },
    { value: 'Alt', label: 'Alt + ' + t('settings.shortcuts.middleButton') },
    { value: 'Shift', label: 'Shift + ' + t('settings.shortcuts.middleButton') },
    { value: 'Ctrl+Shift', label: 'Ctrl + Shift + ' + t('settings.shortcuts.middleButton') },
    { value: 'Ctrl+Alt', label: 'Ctrl + Alt + ' + t('settings.shortcuts.middleButton') },
    { value: 'Alt+Shift', label: 'Alt + Shift + ' + t('settings.shortcuts.middleButton') }
  ]

  return (
    <>
      <SettingsSection
        title={t('settings.shortcuts.globalTitle')}
        description={t('settings.shortcuts.globalDesc')}
      >
        <SettingItem
          label={t('settings.shortcuts.toggleWindow')}
          description={t('settings.shortcuts.toggleWindowDesc')}
        >
          <ShortcutInput
            value={settings.toggleShortcut}
            onChange={(value) => handleShortcutChange('toggleShortcut', value)}
            onReset={() => handleShortcutChange('toggleShortcut', 'Alt+V')}
            presets={['Alt+V', 'Win+V', 'Ctrl+Alt+V', 'F1']}
            hasError={hasErrorStatus('toggleShortcut', 'toggle')}
            errorMessage={getErrorMessage('toggleShortcut', 'toggle')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.previewWindow')}
          description={t('settings.shortcuts.previewWindowDesc')}
        >
          <ShortcutInput
            value={settings.previewShortcut}
            onChange={(value) => handleShortcutChange('previewShortcut', value)}
            onReset={() => handleShortcutChange('previewShortcut', 'Ctrl+`')}
            hasError={hasErrorStatus('previewShortcut', 'preview')}
            errorMessage={getErrorMessage('previewShortcut', 'preview')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.screenshot')}
          description={t('settings.shortcuts.screenshotDesc')}
        >
          <ShortcutInput
            value={settings.screenshotShortcut}
            onChange={(value) => handleShortcutChange('screenshotShortcut', value)}
            onReset={() => handleShortcutChange('screenshotShortcut', 'Ctrl+Shift+A')}
            hasError={hasErrorStatus('screenshotShortcut', 'screenshot')}
            errorMessage={getErrorMessage('screenshotShortcut', 'screenshot')}
          />
        </SettingItem>
      </SettingsSection>

      <SettingsSection
        title={t('settings.shortcuts.numberTitle')}
        description={t('settings.shortcuts.numberDesc')}
      >
        <SettingItem
          label={t('settings.shortcuts.enableNumber')}
          description={t('settings.shortcuts.enableNumberDesc')}
        >
          <Toggle
            checked={settings.numberShortcuts}
            onChange={(checked) => onSettingChange('numberShortcuts', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.numberModifier')}
          description={t('settings.shortcuts.numberModifierDesc')}
        >
          <Select
            value={settings.numberShortcutsModifier}
            onChange={(value) => onSettingChange('numberShortcutsModifier', value)}
            options={numberModifierOptions}
            className="w-56"
          />
        </SettingItem>
      </SettingsSection>

      <SettingsSection
        title={t('settings.shortcuts.mouseTitle')}
        description={t('settings.shortcuts.mouseDesc')}
      >
        <SettingItem
          label={t('settings.shortcuts.enableMouseMiddle')}
          description={t('settings.shortcuts.enableMouseMiddleDesc')}
        >
          <Toggle
            checked={settings.mouseMiddleButtonEnabled}
            onChange={(checked) => onSettingChange('mouseMiddleButtonEnabled', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.mouseMiddleModifier')}
          description={t('settings.shortcuts.mouseMiddleModifierDesc')}
        >
          <Select
            value={settings.mouseMiddleButtonModifier}
            onChange={(value) => onSettingChange('mouseMiddleButtonModifier', value)}
            options={mouseModifierOptions}
            className="w-56"
          />
        </SettingItem>
      </SettingsSection>

      <SettingsSection
        title={t('settings.shortcuts.windowTitle')}
        description={t('settings.shortcuts.windowDesc')}
      >
        <SettingItem
          label={t('settings.shortcuts.navigateUp')}
          description={t('settings.shortcuts.navigateUpDesc')}
        >
          <ShortcutInput
            value={settings.navigateUpShortcut}
            onChange={(value) => onSettingChange('navigateUpShortcut', value)}
            onReset={() => onSettingChange('navigateUpShortcut', 'ArrowUp')}
            hasError={hasErrorStatus('navigateUpShortcut')}
            errorMessage={getErrorMessage('navigateUpShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.navigateDown')}
          description={t('settings.shortcuts.navigateDownDesc')}
        >
          <ShortcutInput
            value={settings.navigateDownShortcut}
            onChange={(value) => onSettingChange('navigateDownShortcut', value)}
            onReset={() => onSettingChange('navigateDownShortcut', 'ArrowDown')}
            hasError={hasErrorStatus('navigateDownShortcut')}
            errorMessage={getErrorMessage('navigateDownShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.tabLeft')}
          description={t('settings.shortcuts.tabLeftDesc')}
        >
          <ShortcutInput
            value={settings.tabLeftShortcut}
            onChange={(value) => onSettingChange('tabLeftShortcut', value)}
            onReset={() => onSettingChange('tabLeftShortcut', 'ArrowLeft')}
            hasError={hasErrorStatus('tabLeftShortcut')}
            errorMessage={getErrorMessage('tabLeftShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.tabRight')}
          description={t('settings.shortcuts.tabRightDesc')}
        >
          <ShortcutInput
            value={settings.tabRightShortcut}
            onChange={(value) => onSettingChange('tabRightShortcut', value)}
            onReset={() => onSettingChange('tabRightShortcut', 'ArrowRight')}
            hasError={hasErrorStatus('tabRightShortcut')}
            errorMessage={getErrorMessage('tabRightShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.focusSearch')}
          description={t('settings.shortcuts.focusSearchDesc')}
        >
          <ShortcutInput
            value={settings.focusSearchShortcut}
            onChange={(value) => onSettingChange('focusSearchShortcut', value)}
            onReset={() => onSettingChange('focusSearchShortcut', 'Tab')}
            hasError={hasErrorStatus('focusSearchShortcut')}
            errorMessage={getErrorMessage('focusSearchShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.hideWindow')}
          description={t('settings.shortcuts.hideWindowDesc')}
        >
          <ShortcutInput
            value={settings.hideWindowShortcut}
            onChange={(value) => onSettingChange('hideWindowShortcut', value)}
            onReset={() => onSettingChange('hideWindowShortcut', 'Escape')}
            hasError={hasErrorStatus('hideWindowShortcut')}
            errorMessage={getErrorMessage('hideWindowShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.executeItem')}
          description={t('settings.shortcuts.executeItemDesc')}
        >
          <ShortcutInput
            value={settings.executeItemShortcut}
            onChange={(value) => onSettingChange('executeItemShortcut', value)}
            onReset={() => onSettingChange('executeItemShortcut', 'Ctrl+Enter')}
            hasError={hasErrorStatus('executeItemShortcut')}
            errorMessage={getErrorMessage('executeItemShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.previousGroup')}
          description={t('settings.shortcuts.previousGroupDesc')}
        >
          <ShortcutInput
            value={settings.previousGroupShortcut}
            onChange={(value) => onSettingChange('previousGroupShortcut', value)}
            onReset={() => onSettingChange('previousGroupShortcut', 'Ctrl+ArrowUp')}
            hasError={hasErrorStatus('previousGroupShortcut')}
            errorMessage={getErrorMessage('previousGroupShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.nextGroup')}
          description={t('settings.shortcuts.nextGroupDesc')}
        >
          <ShortcutInput
            value={settings.nextGroupShortcut}
            onChange={(value) => onSettingChange('nextGroupShortcut', value)}
            onReset={() => onSettingChange('nextGroupShortcut', 'Ctrl+ArrowDown')}
            hasError={hasErrorStatus('nextGroupShortcut')}
            errorMessage={getErrorMessage('nextGroupShortcut')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.togglePin')}
          description={t('settings.shortcuts.togglePinDesc')}
        >
          <ShortcutInput
            value={settings.togglePinShortcut}
            onChange={(value) => onSettingChange('togglePinShortcut', value)}
            onReset={() => onSettingChange('togglePinShortcut', 'Ctrl+P')}
            hasError={hasErrorStatus('togglePinShortcut')}
            errorMessage={getErrorMessage('togglePinShortcut')}
          />
        </SettingItem>
      </SettingsSection>
    </>
  )
}

export default ShortcutsSection
