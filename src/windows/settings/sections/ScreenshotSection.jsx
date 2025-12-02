import { useTranslation } from 'react-i18next';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Toggle from '@shared/components/ui/Toggle';
import Select from '@shared/components/ui/Select';
function ScreenshotSection({
  settings,
  onSettingChange
}) {
  const {
    t
  } = useTranslation();
  const elementDetectionOptions = [{
    value: 'none',
    label: t('settings.screenshot.detectionNone')
  }, {
    value: 'window',
    label: t('settings.screenshot.detectionWindow')
  }, {
    value: 'all',
    label: t('settings.screenshot.detectionAll')
  }];
  return <SettingsSection title={t('settings.screenshot.title')} description={t('settings.screenshot.description')}>
      <SettingItem label={t('settings.screenshot.enabled')} description={t('settings.screenshot.enabledDesc')}>
        <Toggle checked={settings.screenshotEnabled} onChange={checked => onSettingChange('screenshotEnabled', checked)} />
      </SettingItem>

      <SettingItem label={t('settings.screenshot.elementDetection')} description={t('settings.screenshot.elementDetectionDesc')}>
        <Select value={settings.screenshotElementDetection || 'all'} onChange={value => onSettingChange('screenshotElementDetection', value)} options={elementDetectionOptions} className="w-48" />
      </SettingItem>

      <SettingItem label={t('settings.screenshot.magnifier')} description={t('settings.screenshot.magnifierDesc')}>
        <Toggle checked={settings.screenshotMagnifierEnabled} onChange={checked => onSettingChange('screenshotMagnifierEnabled', checked)} />
      </SettingItem>

      <SettingItem label={t('settings.screenshot.hints')} description={t('settings.screenshot.hintsDesc')}>
        <Toggle checked={settings.screenshotHintsEnabled} onChange={checked => onSettingChange('screenshotHintsEnabled', checked)} />
      </SettingItem>

      <SettingItem label={t('settings.screenshot.colorIncludeFormat')} description={t('settings.screenshot.colorIncludeFormatDesc')}>
        <Toggle checked={settings.screenshotColorIncludeFormat} onChange={checked => onSettingChange('screenshotColorIncludeFormat', checked)} />
      </SettingItem>
    </SettingsSection>;
}
export default ScreenshotSection;