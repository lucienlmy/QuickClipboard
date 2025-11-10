import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import SettingsSection from '../components/SettingsSection';
import Button from '@shared/components/ui/Button';
function AboutSection() {
  const {
    t
  } = useTranslation();
  const handleCheckUpdates = () => {
    console.log('检查更新');
  };
  const handleOpenGitHub = () => {
    window.open('https://github.com/mosheng1/QuickClipboard', '_blank');
  };
  return <SettingsSection title={t('settings.about.title')} description={t('settings.about.description')}>
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full mb-4">
          <svg className="w-12 h-12 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('settings.about.appName')}
        </h3>
        
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('settings.about.version')} 1.0.0
        </p>
        
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-8 max-w-md mx-auto">
          {t('settings.about.descriptionText')}
        </p>
        
        <div className="flex gap-3 justify-center">
          <Button variant="primary" icon={<i className="ti ti-download" style={{
          fontSize: 20
        }}></i>} onClick={handleCheckUpdates}>
            {t('settings.about.checkUpdates')}
          </Button>
          
          <Button variant="secondary" icon={<i className="ti ti-brand-github" style={{
          fontSize: 20
        }}></i>} onClick={handleOpenGitHub}>
            {t('settings.about.github')}
          </Button>
        </div>
      </div>
    </SettingsSection>;
}
export default AboutSection;