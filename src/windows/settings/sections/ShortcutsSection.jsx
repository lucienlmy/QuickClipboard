import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'
import ShortcutInput from '../components/ShortcutInput'

function ShortcutsSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

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
            onChange={(value) => onSettingChange('toggleShortcut', value)}
            onReset={() => onSettingChange('toggleShortcut', 'Alt+V')}
            presets={['Alt+V', 'Win+V', 'Ctrl+Alt+V', 'F1']}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.previewWindow')}
          description={t('settings.shortcuts.previewWindowDesc')}
        >
          <ShortcutInput
            value={settings.previewShortcut}
            onChange={(value) => onSettingChange('previewShortcut', value)}
            onReset={() => onSettingChange('previewShortcut', '')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.screenshot')}
          description={t('settings.shortcuts.screenshotDesc')}
        >
          <ShortcutInput
            value={settings.screenshotShortcut}
            onChange={(value) => onSettingChange('screenshotShortcut', value)}
            onReset={() => onSettingChange('screenshotShortcut', '')}
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
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.focusSearch')}
          description={t('settings.shortcuts.focusSearchDesc')}
        >
          <ShortcutInput
            value={settings.focusSearchShortcut}
            onChange={(value) => onSettingChange('focusSearchShortcut', value)}
            onReset={() => onSettingChange('focusSearchShortcut', 'Ctrl+F')}
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
          />
        </SettingItem>

        <SettingItem
          label={t('settings.shortcuts.executeItem')}
          description={t('settings.shortcuts.executeItemDesc')}
        >
          <ShortcutInput
            value={settings.executeItemShortcut}
            onChange={(value) => onSettingChange('executeItemShortcut', value)}
            onReset={() => onSettingChange('executeItemShortcut', 'Enter')}
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
          />
        </SettingItem>
      </SettingsSection>
    </>
  )
}

export default ShortcutsSection
