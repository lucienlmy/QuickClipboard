import { useState, useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';
import { applyBackgroundImage, clearBackgroundImage } from '@shared/utils/backgroundManager';
import SettingsHeader from './components/SettingsHeader';
import SettingsSidebar from './components/SettingsSidebar';
import GeneralSection from './sections/GeneralSection';
import AppearanceSection from './sections/AppearanceSection';
import ShortcutsSection from './sections/ShortcutsSection';
import ClipboardSection from './sections/ClipboardSection';
import AIConfigSection from './sections/AIConfigSection';
import TranslationSection from './sections/TranslationSection';
import PreviewSection from './sections/PreviewSection';
import ScreenshotSection from './sections/ScreenshotSection';
import SoundSection from './sections/SoundSection';
import AppFilterSection from './sections/AppFilterSection';
import DataManagementSection from './sections/DataManagementSection';
import SupportSection from './sections/SupportSection';
import AboutSection from './sections/AboutSection';
import ToastContainer from '@shared/components/common/ToastContainer';
function App() {
  const snap = useSnapshot(settingsStore);
  const {
    theme,
    darkThemeStyle,
    backgroundImagePath
  } = snap;
  const {
    effectiveTheme,
    isDark,
    isBackground
  } = useTheme();
  const [activeSection, setActiveSection] = useState('general');

  // 监听设置变更事件（跨窗口同步）
  useSettingsSync();

  // 应用主题到body
  useEffect(() => {
    applyThemeToBody(theme, 'settings');
  }, [theme, effectiveTheme]);

  // 应用背景图片（仅在背景主题时）
  useEffect(() => {
    if (isBackground && backgroundImagePath) {
      applyBackgroundImage({
        containerSelector: '.settings-container',
        backgroundImagePath,
        windowName: 'settings'
      });
    } else {
      clearBackgroundImage('.settings-container');
    }
  }, [isBackground, backgroundImagePath]);
  const handleSettingChange = async (key, value) => {
    await settingsStore.saveSetting(key, value);
  };
  const renderSection = () => {
    let content;
    switch (activeSection) {
      case 'general':
        content = <GeneralSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'appearance':
        content = <AppearanceSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'shortcuts':
        content = <ShortcutsSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'clipboard':
        content = <ClipboardSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'aiConfig':
        content = <AIConfigSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'translation':
        content = <TranslationSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'quickpaste':
        content = <PreviewSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'screenshot':
        content = <ScreenshotSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'sound':
        content = <SoundSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'appFilter':
        content = <AppFilterSection settings={snap} onSettingChange={handleSettingChange} />;
        break;
      case 'dataManagement':
        content = <DataManagementSection />;
        break;
      case 'support':
        content = <SupportSection />;
        break;
      case 'about':
        content = <AboutSection />;
        break;
      default:
        content = <GeneralSection settings={snap} onSettingChange={handleSettingChange} />;
    }
    return <div key={activeSection} className="animate-slide-in-left-fast">
        {content}
      </div>;
  };
  const containerClasses = `
    settings-container 
    h-screen w-screen 
    flex flex-col 
    overflow-hidden 
    transition-colors duration-500 ease-in-out
    ${isDark ? 'dark bg-gray-900' : ''}
    ${!isDark ? 'bg-white' : ''}
    ${isBackground ? 'backdrop-blur-md bg-opacity-0' : ''}
  `.trim().replace(/\s+/g, ' ');
  return <div className={containerClasses}>
      <SettingsHeader />

      <div className="flex-1 flex overflow-hidden">
        <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

        <main className={`flex-1 overflow-y-auto p-6 transition-colors duration-500 ${isBackground ? 'bg-transparent' : 'bg-gray-50 dark:bg-gray-900'}`}>
          {renderSection()}
        </main>
      </div>

      <ToastContainer />
    </div>;
}
export default App;