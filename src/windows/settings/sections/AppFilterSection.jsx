import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Input from '@shared/components/ui/Input'
import Button from '@shared/components/ui/Button'
import { IconPlus, IconRefresh, IconTrash, IconX ,IconInfoCircle, IconBan, IconCheck, IconBulb} from '@tabler/icons-react'

function AppFilterSection({ settings, onSettingChange }) {
  const { t } = useTranslation()
  const [customAppInput, setCustomAppInput] = useState('')
  const [appList, setAppList] = useState([])
  const [availableApps, setAvailableApps] = useState([])

  const handleAddCustomApp = () => {
    if (!customAppInput.trim()) return
    
    const newList = [...appList, customAppInput.trim()]
    setAppList(newList)
    onSettingChange('appFilterList', newList.join('\n'))
    setCustomAppInput('')
  }

  const handleRemoveApp = (index) => {
    const newList = appList.filter((_, i) => i !== index)
    setAppList(newList)
    onSettingChange('appFilterList', newList.join('\n'))
  }

  const handleClearList = () => {
    setAppList([])
    onSettingChange('appFilterList', '')
  }

  const handleRefreshWindows = async () => {
  }

  const handleAddAvailableApp = (app) => {
    if (!appList.includes(app)) {
      const newList = [...appList, app]
      setAppList(newList)
      onSettingChange('appFilterList', newList.join('\n'))
    }
  }

  return (
    <>
      <SettingsSection
        title={t('settings.appFilter.title')}
        description={t('settings.appFilter.description')}
      >
        <SettingItem
          label={t('settings.appFilter.enabled')}
          description={t('settings.appFilter.enabledDesc')}
        >
          <Toggle
            checked={settings.appFilterEnabled}
            onChange={(checked) => onSettingChange('appFilterEnabled', checked)}
          />
        </SettingItem>

        {settings.appFilterEnabled && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                <IconInfoCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {t('settings.appFilter.statusTitle')}
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {settings.appFilterMode === 'blacklist' 
                    ? t('settings.appFilter.statusBlacklist')
                    : t('settings.appFilter.statusWhitelist')}
                </div>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('settings.appFilter.modeTitle')}
        description={t('settings.appFilter.modeDesc')}
      >
        <div className="flex gap-4">
          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="filterMode"
              value="blacklist"
              checked={settings.appFilterMode === 'blacklist'}
              onChange={(e) => onSettingChange('appFilterMode', e.target.value)}
              className="sr-only peer"
            />
            <div className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg peer-checked:border-blue-500 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-900/20 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                  <IconBan className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {t('settings.appFilter.blacklist')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('settings.appFilter.blacklistDesc')}
                  </div>
                </div>
              </div>
            </div>
          </label>

          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="filterMode"
              value="whitelist"
              checked={settings.appFilterMode === 'whitelist'}
              onChange={(e) => onSettingChange('appFilterMode', e.target.value)}
              className="sr-only peer"
            />
            <div className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg peer-checked:border-blue-500 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-900/20 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                  <IconCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {t('settings.appFilter.whitelist')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('settings.appFilter.whitelistDesc')}
                  </div>
                </div>
              </div>
            </div>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.appFilter.manageTitle')}
        description={t('settings.appFilter.manageDesc')}
      >
        <SettingItem
          label={t('settings.appFilter.addApp')}
          description={t('settings.appFilter.addAppDesc')}
        >
          <div className="flex items-center gap-2">
            <Input
              value={customAppInput}
              onChange={(e) => setCustomAppInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomApp()}
              placeholder={t('settings.appFilter.inputPlaceholder')}
              className="flex-1"
            />
            <Button
              onClick={handleAddCustomApp}
              icon={<IconPlus />}
              size="sm"
            >
              {t('settings.common.add')}
            </Button>
          </div>
        </SettingItem>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                {t('settings.appFilter.addedApps')}
              </h4>
              <Button
                onClick={handleClearList}
                variant="secondary"
                size="sm"
                icon={<IconTrash className="w-3.5 h-3.5" />}
              >
                {t('settings.common.clear')}
              </Button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              {appList.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  {t('settings.appFilter.noApps')}
                </div>
              ) : (
                appList.map((app, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-sm text-gray-900 dark:text-white truncate">
                      {app}
                    </span>
                    <button
                      onClick={() => handleRemoveApp(index)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                    >
                      <IconX className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                {t('settings.appFilter.availableApps')}
              </h4>
              <Button
                onClick={handleRefreshWindows}
                variant="secondary"
                size="sm"
                icon={<IconRefresh className="w-3.5 h-3.5" />}
              >
                {t('settings.common.refresh')}
              </Button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              {availableApps.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  {t('settings.appFilter.clickRefresh')}
                </div>
              ) : (
                availableApps.map((app, index) => (
                  <button
                    key={index}
                    onClick={() => handleAddAvailableApp(app)}
                    className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-500 transition-colors text-left"
                  >
                    <span className="text-sm text-gray-900 dark:text-white truncate">
                      {app}
                    </span>
                    <IconPlus className="w-4 h-4 text-gray-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
            <IconBulb className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <div>{t('settings.appFilter.tip1')}</div>
              <div>{t('settings.appFilter.tip2')}</div>
              <div>{t('settings.appFilter.tip3')}</div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </>
  )
}

export default AppFilterSection
