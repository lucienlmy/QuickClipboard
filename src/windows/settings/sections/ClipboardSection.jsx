import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'
import Input from '@shared/components/ui/Input'
import Textarea from '@shared/components/ui/Textarea'

function ClipboardSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  const positionOptions = [
    { value: 'smart', label: t('settings.clipboard.positionSmart') },
    { value: 'remember', label: t('settings.clipboard.positionRemember') }
  ]

  const titleBarPositionOptions = [
    { value: 'top', label: t('settings.clipboard.positionTop') },
    { value: 'bottom', label: t('settings.clipboard.positionBottom') },
    { value: 'left', label: t('settings.clipboard.positionLeft') },
    { value: 'right', label: t('settings.clipboard.positionRight') }
  ]

  return (
    <>
      <SettingsSection
        title={t('settings.clipboard.title')}
        description={t('settings.clipboard.description')}
      >
        <SettingItem
          label={t('settings.clipboard.monitor')}
          description={t('settings.clipboard.monitorDesc')}
        >
          <Toggle
            checked={settings.clipboardMonitor}
            onChange={(checked) => onSettingChange('clipboardMonitor', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.saveImages')}
          description={t('settings.clipboard.saveImagesDesc')}
        >
          <Toggle
            checked={settings.saveImages}
            onChange={(checked) => onSettingChange('saveImages', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.autoScrollToTop')}
          description={t('settings.clipboard.autoScrollToTopDesc')}
        >
          <Toggle
            checked={settings.autoScrollToTopOnShow}
            onChange={(checked) => onSettingChange('autoScrollToTopOnShow', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.autoClearSearch')}
          description={t('settings.clipboard.autoClearSearchDesc')}
        >
          <Toggle
            checked={settings.autoClearSearch}
            onChange={(checked) => onSettingChange('autoClearSearch', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.windowPosition')}
          description={t('settings.clipboard.windowPositionDesc')}
        >
          <Select
            value={settings.windowPositionMode}
            onChange={(value) => onSettingChange('windowPositionMode', value)}
            options={positionOptions}
            className="w-48"
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.rememberWindowSize')}
          description={t('settings.clipboard.rememberWindowSizeDesc')}
        >
          <Toggle
            checked={settings.rememberWindowSize}
            onChange={(checked) => onSettingChange('rememberWindowSize', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.titleBarPosition')}
          description={t('settings.clipboard.titleBarPositionDesc')}
        >
          <Select
            value={settings.titleBarPosition}
            onChange={(value) => onSettingChange('titleBarPosition', value)}
            options={titleBarPositionOptions}
            className="w-48"
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.edgeHideEnabled')}
          description={t('settings.clipboard.edgeHideEnabledDesc')}
        >
          <Toggle
            checked={settings.edgeHideEnabled}
            onChange={(checked) => onSettingChange('edgeHideEnabled', checked)}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.edgeHideOffset')}
          description={t('settings.clipboard.edgeHideOffsetDesc')}
        >
          <Input
            type="number"
            value={settings.edgeHideOffset || 3}
            onChange={(e) => onSettingChange('edgeHideOffset', parseInt(e.target.value))}
            min={1}
            max={50}
            className="w-24"
            suffix={t('settings.common.pixels')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.sidebarHoverDelay')}
          description={t('settings.clipboard.sidebarHoverDelayDesc')}
        >
          <Input
            type="number"
            value={settings.sidebarHoverDelay || 0.5}
            onChange={(e) => onSettingChange('sidebarHoverDelay', parseFloat(e.target.value))}
            min={0}
            max={10}
            step={0.1}
            className="w-24"
            suffix={t('settings.common.seconds')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.clipboard.autoFocusSearch')}
          description={t('settings.clipboard.autoFocusSearchDesc')}
        >
          <Toggle
            checked={settings.autoFocusSearch}
            onChange={(checked) => onSettingChange('autoFocusSearch', checked)}
          />
        </SettingItem>
      </SettingsSection>
    </>
  )
}

export default ClipboardSection
