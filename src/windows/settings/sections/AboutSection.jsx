import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getAppVersion } from '@shared/services/settingsService';
import SettingsSection from '../components/SettingsSection';
import Button from '@shared/components/ui/Button';
import logoIcon from '@/assets/icon1024.png';
import wxzsm from '@/assets/wxzsm.png';
function AboutSection() {
  const {
    t
  } = useTranslation();
  const [showQROverlay, setShowQROverlay] = useState(false);
  const [version, setVersion] = useState('1.0.0');
  
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const versionInfo = await getAppVersion();
        setVersion(versionInfo.version || '1.0.0');
      } catch (error) {
        console.error('获取版本信息失败:', error);
        setVersion('1.0.0');
      }
    };
    
    fetchVersion();
  }, []);
  
  const handleCheckUpdates = () => {
    console.log('检查更新');
  };
  const handleOpenGitHub = async () => {
    try {
      await openUrl('https://github.com/mosheng1/QuickClipboard');
    } catch (error) {
      console.error('打开GitHub链接失败:', error);
    }
  };
  const handleOpenBilibili = async () => {
    try {
      await openUrl('https://space.bilibili.com/438982697');
    } catch (error) {
      console.error('打开Bilibili链接失败:', error);
    }
  };
  const handleOpenQQGroup = async () => {
    try {
      await openUrl('https://qm.qq.com/q/HGOqmhlUqI');
    } catch (error) {
      console.error('打开QQ群链接失败:', error);
    }
  };

  return (
    <SettingsSection title={t('settings.about.title')} description={t('settings.about.description')}>
      <div className="space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full mb-3 overflow-hidden">
            <img src={logoIcon} alt="QuickClipboard Logo" className="w-12 h-12 object-contain" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            {t('settings.about.appName')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {t('settings.about.version')} {version}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 max-w-md mx-auto">
            {t('settings.about.descriptionText')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="primary" icon={<i className="ti ti-download"></i>} onClick={handleCheckUpdates}>
            {t('settings.about.checkUpdates')}
          </Button>
          <Button variant="secondary" icon={<i className="ti ti-brand-github"></i>} onClick={handleOpenGitHub}>
            GitHub
          </Button>
          <Button variant="secondary" icon={<i className="ti ti-brand-qq"></i>} onClick={handleOpenQQGroup}>
            QQ群
          </Button>
          <Button variant="secondary" icon={<i className="ti ti-brand-bilibili"></i>} onClick={handleOpenBilibili}>
            Bilibili
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <i className="ti ti-star text-yellow-500 text-lg"></i>
              <span className="text-sm text-gray-600 dark:text-gray-300">{t('settings.about.star')}</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <i className="ti ti-bug text-red-500 text-lg"></i>
              <span className="text-sm text-gray-600 dark:text-gray-300">{t('settings.about.feedback')}</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <i className="ti ti-speakerphone text-blue-500 text-lg"></i>
              <span className="text-sm text-gray-600 dark:text-gray-300">{t('settings.about.share')}</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <i className="ti ti-coffee text-orange-500 text-lg"></i>
              <span className="text-sm text-gray-600 dark:text-gray-300">{t('settings.about.donate')}</span>
            </div>
          </div>

          <div className="flex justify-center">
            <div 
              className="relative cursor-pointer"
              onMouseEnter={() => setShowQROverlay(true)}
              onMouseLeave={() => setShowQROverlay(false)}
            >
              <div className="w-50 h-50 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-600">
                <img src={wxzsm} alt="微信赞赏码" className="w-full h-full object-contain rounded-lg" />
              </div>
              <div className="absolute -top-2 -right-2 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center">
                <i className="ti ti-brand-wechat text-white"></i>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">微信赞赏</p>
              
              {showQROverlay && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 border border-gray-200 dark:border-gray-600">
                  <div className="w-56 h-56 bg-white rounded-lg">
                    <img src={wxzsm} alt="微信赞赏码" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
export default AboutSection;