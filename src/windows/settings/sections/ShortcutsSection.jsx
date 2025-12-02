import { useTranslation } from 'react-i18next';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Toggle from '@shared/components/ui/Toggle';
import Select from '@shared/components/ui/Select';
import Slider from '@shared/components/ui/Slider';
import ShortcutInput from '../components/ShortcutInput';
import { useShortcutStatuses } from '@shared/hooks/useShortcutStatuses';
import { useShortcutDuplicateCheck } from '@shared/hooks/useShortcutDuplicateCheck';
import { promptDisableWinVHotkeyIfNeeded, promptEnableWinVHotkey } from '@shared/api/system';

function ShortcutsSection({
  settings,
  onSettingChange
}) {
  const {
    t
  } = useTranslation();
  const {
    statuses,
    hasError: hasBackendError,
    getError: getBackendError,
    reload
  } = useShortcutStatuses();
  const {
    hasDuplicate,
    getDuplicateError
  } = useShortcutDuplicateCheck(settings);
  const handleShortcutChange = async (key, value) => {
    if (key === 'toggleShortcut' && value === 'Win+V' && settings.toggleShortcut !== 'Win+V') {
      try {
        const ok = await promptDisableWinVHotkeyIfNeeded();
        if (!ok) {
          setTimeout(() => {
            reload();
          }, 150);
          return;
        }
      } catch (error) {
        console.error('调用 Win+V 禁用提示命令失败:', error);
        setTimeout(() => {
          reload();
        }, 150);
        return;
      }
    }

    await onSettingChange(key, value);
    setTimeout(() => {
      reload();
    }, 150);
  };
  const getErrorMessage = (key, backendId) => {
    const duplicateError = getDuplicateError(key);
    const backendError = backendId ? getBackendError(backendId) : null;
    if (duplicateError && backendError) {
      return `${duplicateError}；${backendError}`;
    }
    return duplicateError || backendError;
  };
  const hasErrorStatus = (key, backendId) => {
    return hasDuplicate(key) || backendId && hasBackendError(backendId);
  };
  const numberModifierOptions = [{
    value: 'Ctrl',
    label: 'Ctrl + 1~9'
  }, {
    value: 'Shift',
    label: 'Shift + 1~9'
  }, {
    value: 'Ctrl+Shift',
    label: 'Ctrl + Shift + 1~9'
  }, {
    value: 'F',
    label: 'F1 ~ F9'
  }, {
    value: 'Ctrl+F',
    label: 'Ctrl + F1~F9'
  }, {
    value: 'Shift+F',
    label: 'Shift + F1~F9'
  }, {
    value: 'Ctrl+Shift+F',
    label: 'Ctrl + Shift + F1~F9'
  }];
  const mouseModifierOptions = [{
    value: 'None',
    label: t('settings.shortcuts.mouseMiddleOnly')
  }, {
    value: 'Ctrl',
    label: 'Ctrl + ' + t('settings.shortcuts.middleButton')
  }, {
    value: 'Alt',
    label: 'Alt + ' + t('settings.shortcuts.middleButton')
  }, {
    value: 'Shift',
    label: 'Shift + ' + t('settings.shortcuts.middleButton')
  }, {
    value: 'Ctrl+Shift',
    label: 'Ctrl + Shift + ' + t('settings.shortcuts.middleButton')
  }, {
    value: 'Ctrl+Alt',
    label: 'Ctrl + Alt + ' + t('settings.shortcuts.middleButton')
  }, {
    value: 'Alt+Shift',
    label: 'Alt + Shift + ' + t('settings.shortcuts.middleButton')
  }];
  const mouseTriggerOptions = [{
    value: 'short_press',
    label: t('settings.shortcuts.mouseMiddleTriggerShortPress')
  }, {
    value: 'long_press',
    label: t('settings.shortcuts.mouseMiddleTriggerLongPress')
  }];
  return <>
      <SettingsSection title={t('settings.shortcuts.globalTitle')} description={t('settings.shortcuts.globalDesc')}>
        <SettingItem label={t('settings.shortcuts.toggleWindow')} description={t('settings.shortcuts.toggleWindowDesc')}>
          <div className="flex flex-col items-end gap-1">
            <ShortcutInput
              value={settings.toggleShortcut}
              onChange={value => handleShortcutChange('toggleShortcut', value)}
              onReset={() => handleShortcutChange('toggleShortcut', 'Shift+Space')}
              presets={['Shift+Space', 'Win+V', 'Ctrl+Alt+V', 'F1']}
              hasError={hasErrorStatus('toggleShortcut', 'toggle')}
              errorMessage={getErrorMessage('toggleShortcut', 'toggle')}
            />

            <button
              type="button"
              className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
              onClick={async () => {
                try {
                  await onSettingChange('toggleShortcut', 'Shift+Space');
                  await promptEnableWinVHotkey();
                  setTimeout(() => {
                    reload();
                  }, 150);
                } catch (error) {
                  console.error('调用恢复系统 Win+V 命令失败:', error);
                }
              }}
            >
              {t('settings.shortcuts.restoreSystemWinV')}
            </button>
          </div>
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.quickpasteWindow')} description={t('settings.shortcuts.quickpasteWindowDesc')}>
          <ShortcutInput value={settings.quickpasteShortcut} onChange={value => handleShortcutChange('quickpasteShortcut', value)} onReset={() => handleShortcutChange('quickpasteShortcut', 'Ctrl+`')} hasError={hasErrorStatus('quickpasteShortcut', 'quickpaste')} errorMessage={getErrorMessage('quickpasteShortcut', 'quickpaste')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.screenshot')} description={t('settings.shortcuts.screenshotDesc')}>
          <ShortcutInput value={settings.screenshotShortcut} onChange={value => handleShortcutChange('screenshotShortcut', value)} onReset={() => handleShortcutChange('screenshotShortcut', 'Ctrl+Shift+A')} hasError={hasErrorStatus('screenshotShortcut', 'screenshot')} errorMessage={getErrorMessage('screenshotShortcut', 'screenshot')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.toggleClipboardMonitor')} description={t('settings.shortcuts.toggleClipboardMonitorDesc')}>
          <ShortcutInput value={settings.toggleClipboardMonitorShortcut} onChange={value => handleShortcutChange('toggleClipboardMonitorShortcut', value)} onReset={() => handleShortcutChange('toggleClipboardMonitorShortcut', 'Ctrl+Shift+Z')} hasError={hasErrorStatus('toggleClipboardMonitorShortcut', 'toggle_clipboard_monitor')} errorMessage={getErrorMessage('toggleClipboardMonitorShortcut', 'toggle_clipboard_monitor')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.togglePasteWithFormat')} description={t('settings.shortcuts.togglePasteWithFormatDesc')}>
          <ShortcutInput value={settings.togglePasteWithFormatShortcut} onChange={value => handleShortcutChange('togglePasteWithFormatShortcut', value)} onReset={() => handleShortcutChange('togglePasteWithFormatShortcut', 'Ctrl+Shift+X')} hasError={hasErrorStatus('togglePasteWithFormatShortcut', 'toggle_paste_with_format')} errorMessage={getErrorMessage('togglePasteWithFormatShortcut', 'toggle_paste_with_format')} />
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t('settings.shortcuts.numberTitle')} description={t('settings.shortcuts.numberDesc')}>
        <SettingItem label={t('settings.shortcuts.enableNumber')} description={t('settings.shortcuts.enableNumberDesc')}>
          <Toggle checked={settings.numberShortcuts} onChange={checked => onSettingChange('numberShortcuts', checked)} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.numberModifier')} description={t('settings.shortcuts.numberModifierDesc')}>
          <Select value={settings.numberShortcutsModifier} onChange={value => onSettingChange('numberShortcutsModifier', value)} options={numberModifierOptions} className="w-56" />
        </SettingItem>

        {hasBackendError('number_shortcuts') && (
          <div className="px-4 py-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md">
            <span className="font-medium">{t('settings.shortcuts.numberRegistrationFailed')}：</span>
            {statuses['number_shortcuts']?.shortcut}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.shortcuts.mouseTitle')} description={t('settings.shortcuts.mouseDesc')}>
        <SettingItem label={t('settings.shortcuts.enableMouseMiddle')} description={t('settings.shortcuts.enableMouseMiddleDesc')}>
          <Toggle checked={settings.mouseMiddleButtonEnabled} onChange={checked => onSettingChange('mouseMiddleButtonEnabled', checked)} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.mouseMiddleModifier')} description={t('settings.shortcuts.mouseMiddleModifierDesc')}>
          <Select value={settings.mouseMiddleButtonModifier} onChange={value => onSettingChange('mouseMiddleButtonModifier', value)} options={mouseModifierOptions} className="w-56" />
        </SettingItem>

        {settings.mouseMiddleButtonModifier === 'None' && (
          <SettingItem label={t('settings.shortcuts.mouseMiddleTrigger')} description={t('settings.shortcuts.mouseMiddleTriggerDesc')}>
            <Select value={settings.mouseMiddleButtonTrigger} onChange={value => onSettingChange('mouseMiddleButtonTrigger', value)} options={mouseTriggerOptions} className="w-56" />
          </SettingItem>
        )}

        {settings.mouseMiddleButtonModifier === 'None' && (
          <SettingItem label={t('settings.shortcuts.mouseMiddleLongPressThreshold')} description={t('settings.shortcuts.mouseMiddleLongPressThresholdDesc')}>
            <Slider value={settings.mouseMiddleButtonLongPressMs} onChange={value => onSettingChange('mouseMiddleButtonLongPressMs', value)} min={100} max={1000} step={50} unit="ms" />
          </SettingItem>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.shortcuts.windowTitle')} description={t('settings.shortcuts.windowDesc')}>
        <SettingItem label={t('settings.shortcuts.navigateUp')} description={t('settings.shortcuts.navigateUpDesc')}>
          <ShortcutInput value={settings.navigateUpShortcut} onChange={value => onSettingChange('navigateUpShortcut', value)} onReset={() => onSettingChange('navigateUpShortcut', 'ArrowUp')} hasError={hasErrorStatus('navigateUpShortcut')} errorMessage={getErrorMessage('navigateUpShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.navigateDown')} description={t('settings.shortcuts.navigateDownDesc')}>
          <ShortcutInput value={settings.navigateDownShortcut} onChange={value => onSettingChange('navigateDownShortcut', value)} onReset={() => onSettingChange('navigateDownShortcut', 'ArrowDown')} hasError={hasErrorStatus('navigateDownShortcut')} errorMessage={getErrorMessage('navigateDownShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.tabLeft')} description={t('settings.shortcuts.tabLeftDesc')}>
          <ShortcutInput value={settings.tabLeftShortcut} onChange={value => onSettingChange('tabLeftShortcut', value)} onReset={() => onSettingChange('tabLeftShortcut', 'ArrowLeft')} hasError={hasErrorStatus('tabLeftShortcut')} errorMessage={getErrorMessage('tabLeftShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.tabRight')} description={t('settings.shortcuts.tabRightDesc')}>
          <ShortcutInput value={settings.tabRightShortcut} onChange={value => onSettingChange('tabRightShortcut', value)} onReset={() => onSettingChange('tabRightShortcut', 'ArrowRight')} hasError={hasErrorStatus('tabRightShortcut')} errorMessage={getErrorMessage('tabRightShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.focusSearch')} description={t('settings.shortcuts.focusSearchDesc')}>
          <ShortcutInput value={settings.focusSearchShortcut} onChange={value => onSettingChange('focusSearchShortcut', value)} onReset={() => onSettingChange('focusSearchShortcut', 'Tab')} hasError={hasErrorStatus('focusSearchShortcut')} errorMessage={getErrorMessage('focusSearchShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.hideWindow')} description={t('settings.shortcuts.hideWindowDesc')}>
          <ShortcutInput value={settings.hideWindowShortcut} onChange={value => onSettingChange('hideWindowShortcut', value)} onReset={() => onSettingChange('hideWindowShortcut', 'Escape')} hasError={hasErrorStatus('hideWindowShortcut')} errorMessage={getErrorMessage('hideWindowShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.executeItem')} description={t('settings.shortcuts.executeItemDesc')}>
          <ShortcutInput value={settings.executeItemShortcut} onChange={value => onSettingChange('executeItemShortcut', value)} onReset={() => onSettingChange('executeItemShortcut', 'Ctrl+Enter')} hasError={hasErrorStatus('executeItemShortcut')} errorMessage={getErrorMessage('executeItemShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.previousGroup')} description={t('settings.shortcuts.previousGroupDesc')}>
          <ShortcutInput value={settings.previousGroupShortcut} onChange={value => onSettingChange('previousGroupShortcut', value)} onReset={() => onSettingChange('previousGroupShortcut', 'Ctrl+ArrowUp')} hasError={hasErrorStatus('previousGroupShortcut')} errorMessage={getErrorMessage('previousGroupShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.nextGroup')} description={t('settings.shortcuts.nextGroupDesc')}>
          <ShortcutInput value={settings.nextGroupShortcut} onChange={value => onSettingChange('nextGroupShortcut', value)} onReset={() => onSettingChange('nextGroupShortcut', 'Ctrl+ArrowDown')} hasError={hasErrorStatus('nextGroupShortcut')} errorMessage={getErrorMessage('nextGroupShortcut')} />
        </SettingItem>

        <SettingItem label={t('settings.shortcuts.togglePin')} description={t('settings.shortcuts.togglePinDesc')}>
          <ShortcutInput value={settings.togglePinShortcut} onChange={value => onSettingChange('togglePinShortcut', value)} onReset={() => onSettingChange('togglePinShortcut', 'Ctrl+P')} hasError={hasErrorStatus('togglePinShortcut')} errorMessage={getErrorMessage('togglePinShortcut')} />
        </SettingItem>
      </SettingsSection>
    </>;
}
export default ShortcutsSection;