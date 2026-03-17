import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { open } from '@tauri-apps/plugin-dialog';
import { settingsStore } from '@shared/store/settingsStore';
import { toast } from '@shared/store/toastStore';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Toggle from '@shared/components/ui/Toggle';
import SegmentedControl from '@shared/components/ui/SegmentedControl';
import ThemeOption from '../components/ThemeOption';
function AppearanceSection({
  settings,
  onSettingChange
}) {
  const {
    t
  } = useTranslation();
  const {
    theme,
    darkThemeStyle,
    backgroundImagePath
  } = useSnapshot(settingsStore);
  const themeOptions = [{
    id: 'auto',
    label: t('settings.appearance.themeAuto'),
    preview: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  }, {
    id: 'light',
    label: t('settings.appearance.themeLight'),
    preview: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
  }, {
    id: 'dark',
    label: t('settings.appearance.themeDark'),
    preview: 'linear-gradient(135deg, #2c3e50 0%, #000000 100%)'
  }, {
    id: 'background',
    label: t('settings.appearance.themeBackground'),
    preview: 'linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)'
  }];
  const handleSelectBackgroundImage = async () => {
    try {
      const selected = await open({
        title: t('settings.appearance.selectBackgroundImage'),
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
        }]
      });
      if (selected) {
        await onSettingChange('backgroundImagePath', selected);
        toast.success(t('settings.appearance.backgroundImageSet'));
      }
    } catch (error) {
      console.error('Failed to select background image:', error);
      toast.error(t('settings.appearance.backgroundImageError'));
    }
  };
  const handleClearBackgroundImage = async () => {
    try {
      await onSettingChange('backgroundImagePath', '');
      toast.success(t('settings.appearance.backgroundImageCleared'));
    } catch (error) {
      console.error('Failed to clear background image:', error);
    }
  };
  return <SettingsSection title={t('settings.appearance.title')} description={t('settings.appearance.description')}>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-qc-fg mb-3">
            {t('settings.appearance.themeSelect')}
          </label>
          <p className="text-xs text-qc-fg-muted mb-4">
            {t('settings.appearance.themeSelectDesc')}
          </p>
          
          <div className="grid grid-cols-4 gap-3">
            {themeOptions.map(option => <ThemeOption key={option.id} option={option} isActive={theme === option.id} onClick={() => settingsStore.setTheme(option.id)} />)}
          </div>
        </div>

        {(theme === 'dark' || theme === 'auto') && <div className="animate-slide-in-left-fast">
            <label className="block text-sm font-medium text-qc-fg mb-3">
              {t('settings.appearance.darkThemeStyle') || '暗色风格'}
            </label>
            <p className="text-xs text-qc-fg-muted mb-4">
              {t('settings.appearance.darkThemeStyleDesc') || '选择暗色主题的显示风格'}
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => onSettingChange('darkThemeStyle', 'modern')} className={`
                  flex flex-col items-start gap-2 p-4 rounded-lg border-2 
                  transition-all duration-300 
                  focus:outline-none active:scale-95
                  ${darkThemeStyle === 'modern' ? 'border-blue-500 bg-qc-active scale-102 shadow-lg shadow-blue-500/20' : 'border-qc-border hover:border-qc-border-strong hover:scale-101 hover:shadow-md'}
                `}>
                <div className="w-full">
                  <div className="text-sm font-semibold text-qc-fg mb-1">
                    {t('settings.appearance.darkThemeModern') || '现代风格'}
                  </div>
                  <div className="text-xs text-qc-fg-muted">
                    {t('settings.appearance.darkThemeModernDesc') || '色彩丰富的现代暗色主题'}
                  </div>
                </div>
              </button>

              <button onClick={() => onSettingChange('darkThemeStyle', 'classic')} className={`
                  flex flex-col items-start gap-2 p-4 rounded-lg border-2 
                  transition-all duration-300 
                  focus:outline-none active:scale-95
                  ${darkThemeStyle === 'classic' ? 'border-blue-500 bg-qc-active scale-102 shadow-lg shadow-blue-500/20' : 'border-qc-border hover:border-qc-border-strong hover:scale-101 hover:shadow-md'}
                `}>
                <div className="w-full">
                  <div className="text-sm font-semibold text-qc-fg mb-1">
                    {t('settings.appearance.darkThemeClassic') || '经典风格'}
                  </div>
                  <div className="text-xs text-qc-fg-muted">
                    {t('settings.appearance.darkThemeClassicDesc') || '低调优雅的灰色暗色主题'}
                  </div>
                </div>
              </button>
            </div>
          </div>}

        {theme === 'background' && <div className="space-y-3 animate-slide-in-left-fast">
            <label className="block text-sm font-medium text-qc-fg">
              {t('settings.appearance.backgroundImage')}
            </label>
            <p className="text-xs text-qc-fg-muted">
              {t('settings.appearance.backgroundImageDesc')}
            </p>
            
            <div className="flex items-center gap-3">
              <button onClick={handleSelectBackgroundImage} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                <i className="ti ti-photo" style={{
              fontSize: 18
            }}></i>
                {backgroundImagePath ? t('settings.appearance.changeBackgroundImage') : t('settings.appearance.selectBackgroundImage')}
              </button>

              {backgroundImagePath && <button onClick={handleClearBackgroundImage} className="flex items-center gap-2 px-4 py-2 bg-qc-panel hover:bg-qc-hover text-qc-fg rounded-lg transition-colors">
                  <i className="ti ti-x" style={{
              fontSize: 18
            }}></i>
                  {t('settings.appearance.clearBackgroundImage')}
                </button>}
            </div>

            {backgroundImagePath && <div className="text-xs text-qc-fg-muted truncate">
                {t('settings.appearance.currentImage')}: {backgroundImagePath}
              </div>}
          </div>}

        <div>
          <SettingItem label={t('settings.appearance.clipboardAnimation')} description={t('settings.appearance.clipboardAnimationDesc')}>
            <Toggle checked={settings.clipboardAnimationEnabled} onChange={checked => onSettingChange('clipboardAnimationEnabled', checked)} />
          </SettingItem>

          <SettingItem label={t('settings.appearance.uiAnimation')} description={t('settings.appearance.uiAnimationDesc')}>
            <Toggle checked={settings.uiAnimationEnabled} onChange={checked => onSettingChange('uiAnimationEnabled', checked)} />
          </SettingItem>

          <SettingItem label={t('listSettings.listStyle.label')} description={t('listSettings.title')}>
            <SegmentedControl value={settings.listStyle || 'compact'} onChange={value => onSettingChange('listStyle', value)} options={[{
              value: 'compact',
              label: t('listSettings.listStyle.compact')
            }, {
              value: 'card',
              label: t('listSettings.listStyle.card')
            }]} className="max-w-sm" />
          </SettingItem>

          <SettingItem label={t('listSettings.rowHeight.label')} description={t('listSettings.title')}>
            <SegmentedControl value={settings.rowHeight || 'medium'} onChange={value => onSettingChange('rowHeight', value)} options={[{
              value: 'auto',
              label: t('listSettings.rowHeight.auto')
            }, {
              value: 'large',
              label: t('listSettings.rowHeight.large')
            }, {
              value: 'medium',
              label: t('listSettings.rowHeight.medium')
            }, {
              value: 'small',
              label: t('listSettings.rowHeight.small')
            }]} className="max-w-xl" />
          </SettingItem>

          {settings.listStyle === 'card' && <SettingItem label={t('settings.appearance.cardSpacing')} description={t('settings.appearance.cardSpacingDesc')}>
              <SegmentedControl value={String(settings.cardSpacing ?? 12)} onChange={value => onSettingChange('cardSpacing', parseInt(value, 10))} options={[0, 4, 8, 12, 16, 20].map(v => ({
              value: String(v),
              label: `${v}px`
            }))} wrap columns={3} className="max-w-sm" />
            </SettingItem>}
            
          <SettingItem label={t('listSettings.fileDisplayMode.label')} description={t('listSettings.title')}>
            <SegmentedControl value={settings.fileDisplayMode || 'detailed'} onChange={value => onSettingChange('fileDisplayMode', value)} options={[{
              value: 'detailed',
              label: t('listSettings.fileDisplayMode.detailed')
            }, {
              value: 'iconOnly',
              label: t('listSettings.fileDisplayMode.iconOnly')
            }]} className="max-w-md" />
          </SettingItem>

        </div>
      </div>
    </SettingsSection>;
}
export default AppearanceSection;