import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import 'uno.css';
import '@unocss/reset/tailwind.css';
import { listen, emit } from '@tauri-apps/api/event'
import { relaunch, exit } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'
import { getVersion } from '@tauri-apps/api/app'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import '@shared/i18n';
import { useTranslation } from 'react-i18next'
import '@shared/styles/index.css'
import '@shared/styles/theme-background.css'
import { initStores } from '@shared/store'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

function App() {
  const { t, i18n } = useTranslation()
  const [forceUpdate, setForceUpdate] = useState(false)
  const [status, setStatus] = useState('checking')
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 })
  const [message, setMessage] = useState(t('updater.checking', { defaultValue: '正在检查更新...' }))
  const [versionInfo, setVersionInfo] = useState(null)
  const [notesContent, setNotesContent] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesError, setNotesError] = useState('')
  const [releaseUrl, setReleaseUrl] = useState('')
  const [currentVersion, setCurrentVersion] = useState('')
  
  const updateInstanceRef = useRef(null)
  const configReceivedRef = useRef(false)

  useEffect(() => {
    const init = async () => {
      try {
        const version = await getVersion()
        setCurrentVersion(version)
      } catch (e) {
        console.error('无法获取当前版本：', e)
      }
      try {
        const update = await check()
        if (update) {
          updateInstanceRef.current = update
        }
      } catch (e) {
        console.error('检查更新失败：', e)
      }
    }
    init()
  }, [])

  useEffect(() => {
    const unlisten = listen('update-config', async (e) => {
      if (configReceivedRef.current) return
      configReceivedRef.current = true
      
      try {
        const cfg = e?.payload || {}
        const isForceUpdate = typeof cfg.forceUpdate === 'boolean' ? cfg.forceUpdate : false
        setForceUpdate(isForceUpdate)
        const v = cfg.version || null
        const n = cfg.notes || null
        setVersionInfo(v ? { version: v, date: undefined, notes: n } : null)
        if (n) await loadNotes(n)
        setStatus('available')
        
        if (isForceUpdate) {
          const waitForUpdate = async () => {
            for (let i = 0; i < 20; i++) {
              if (updateInstanceRef.current) {
                await startDownloadInternal(updateInstanceRef.current)
                return
              }
              await new Promise(r => setTimeout(r, 200))
            }
            const update = await check()
            if (update) {
              updateInstanceRef.current = update
              await startDownloadInternal(update)
            }
          }
          waitForUpdate()
        }
      } catch (_) {}
    })
    emit('updater-ready').catch(() => {})
    return () => { unlisten.then(f => f()).catch(() => {}) }
  }, [])

  useEffect(() => {
    switch (status) {
      case 'checking':
        setMessage(t('updater.checking', { defaultValue: '正在检查更新...' }))
        break
      case 'none':
        setMessage(t('updater.noUpdate', { defaultValue: '当前已是最新版本' }))
        break
      case 'downloading':
        setMessage(t('updater.downloading', { defaultValue: '正在下载更新...' }))
        break
      case 'installed':
        setMessage(t('updater.installedRestarting', { defaultValue: '更新已安装，正在重启...' }))
        break
      case 'available':
        setMessage(t('updater.newVersionAvailable', { defaultValue: '发现新版本' }))
        break
      default:
        break
    }
  }, [i18n.language, status, versionInfo?.version])

  async function loadNotes(notesField) {
    try {
      setNotesError('')
      if (!notesField) {
        setNotesContent('')
        setReleaseUrl('')
        return
      }
      if (typeof notesField === 'string' && /^https?:\/\//i.test(notesField)) {
        setNotesLoading(true)
        const resp = await fetch(notesField)
        const ct = resp.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const data = await resp.json()
          setNotesContent((data && (data.body || data.note || '')) || '')
          setReleaseUrl((data && (data.html_url || data.url || notesField)) || '')
        } else {
          const text = await resp.text()
          setNotesContent(text || '')
          setReleaseUrl(notesField)
        }
      } else {
        setNotesContent(String(notesField))
        setReleaseUrl('')
      }
    } catch (err) {
      setNotesError(`加载更新内容失败：${err?.message || err}`)
      setReleaseUrl(typeof notesField === 'string' ? notesField : '')
    } finally {
      setNotesLoading(false)
    }
  }

  async function startDownloadInternal(update) {
    try {
      setStatus('downloading')
      setMessage(t('updater.downloading', { defaultValue: '正在下载更新...' }))
      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength || 0
            setProgress({ downloaded, total })
            break
          case 'Progress':
            downloaded += event.data.chunkLength || 0
            setProgress({ downloaded, total })
            break
          case 'Finished':
            setProgress({ downloaded: total, total })
            break
          default:
            break
        }
      })
      setStatus('installed')
      setMessage(t('updater.installedRestarting', { defaultValue: '更新已安装，正在重启...' }))
      await relaunch()
    } catch (e) {
      setStatus('error')
      setMessage(t('updater.downloadFailed', { defaultValue: '下载或安装失败' }))
    }
  }

  async function startDownload() {
    try {
      let update = updateInstanceRef.current
      if (!update) {
        update = await check()
        if (update) {
          updateInstanceRef.current = update
        }
      }
      if (!update) {
        setStatus('none')
        setMessage(t('updater.noUpdateShort', { defaultValue: '未发现新版本' }))
        return
      }
      await startDownloadInternal(update)
    } catch (e) {
      setStatus('error')
      setMessage(t('updater.downloadFailed', { defaultValue: '下载或安装失败' }))
    }
  }

  const handleClose = useCallback(async () => {
    if (forceUpdate) {
      await exit(0)
    } else {
      const w = getCurrentWebviewWindow()
      try { await w.close() } catch (_) {}
    }
  }, [forceUpdate])

  const pct = progress.total > 0 ? Math.min(100, Math.round(progress.downloaded * 100 / progress.total)) : 0

  return (
    <div className="h-full w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6 flex flex-col items-center" data-tauri-drag-region>
      <div className="w-full max-w-[780px] h-full flex flex-col gap-4" data-tauri-drag-region>
        <div className="flex items-center justify-between" data-tauri-drag-region>
          <div className="text-xl font-semibold flex items-center gap-2">
            <i className="ti ti-rocket" /> {t('about.appName', { defaultValue: 'QuickClipboard' })} · {t('updater.title', { defaultValue: '应用更新' })}
          </div>
        </div>
        {status === 'checking' ? (
          <div className="flex-1 min-h-40 flex flex-col items-center justify-center gap-3">
            <i className="ti ti-loader-2 animate-spin text-5xl" />
            <div className="text-sm opacity-90">{t('updater.checking', { defaultValue: '正在检查更新...' })}</div>
          </div>
        ) : (
          <>
            <div className="text-sm opacity-90">{status === 'error' ? null : message}</div>

            {versionInfo && (status === 'available' || status === 'downloading' || status === 'error') && (
              <div className="text-xs sm:text-sm opacity-90 flex items-center gap-3 flex-wrap">
                <div className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800">
                  <span className="font-medium">{currentVersion || '--'}</span>
                </div>
                <i className="ti ti-arrow-right text-gray-400" />
                <div className="px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  <span className="font-semibold">{versionInfo.version || '--'}</span>
                </div>
              </div>
            )}

            {versionInfo && (
              <div className="flex-1 min-h-[180px] w-full border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-gray-50 dark:bg-gray-800/50 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <i className="ti ti-notes" /> {t('updater.notes', { defaultValue: '更新内容' })}
                  </div>
                  {releaseUrl && (
                    <a className="text-xs text-blue-600 hover:underline" href={releaseUrl} target="_blank" rel="noreferrer">
                      {t('updater.viewOnGithub', { defaultValue: '在 GitHub 查看发布' })}
                    </a>
                  )}
                </div>

                {notesLoading && (
                  <div className="text-xs opacity-70">{t('updater.loadingNotes', { defaultValue: '正在加载更新说明...' })}</div>
                )}
                {!notesLoading && notesError && (
                  <div className="text-xs text-red-500">
                    {notesError} {releaseUrl && (
                      <a className="ml-2 underline" href={releaseUrl} target="_blank" rel="noreferrer">{t('updater.viewInBrowser', { defaultValue: '在浏览器查看' })}</a>
                    )}
                  </div>
                )}
                {!notesLoading && !notesError && (
                  <div className="text-sm leading-6 flex-1 overflow-auto">
                    {notesContent ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{notesContent}</ReactMarkdown>
                    ) : (
                      t('updater.noNotes', { defaultValue: '暂无更新说明' })
                    )}
                  </div>
                )}
              </div>
            )}

            {status === 'downloading' && (
              <div className="w-full max-w-[520px] mt-1">
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded">
                  <div className="h-2 bg-blue-500 rounded transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs mt-1 opacity-70 flex items-center gap-2">
                  <i className="ti ti-loader-2 animate-spin" />
                  <span>{pct}%</span>
                  {progress.total > 0 && (
                    <span className="ml-2">
                      {(progress.downloaded / 1024 / 1024).toFixed(1)} / {(progress.total / 1024 / 1024).toFixed(1)} MB
                    </span>
                  )}
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="w-full max-w-[520px] mt-1 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <i className="ti ti-alert-circle" />
                  <span className="text-sm font-medium">{t('updater.updateFailed', { defaultValue: '更新失败' })}</span>
                </div>
                <div className="text-xs mt-1 text-red-500 dark:text-red-400">
                  {message}
                </div>
                <a 
                  className="text-xs mt-2 inline-block text-blue-600 hover:underline" 
                  href={releaseUrl || 'https://github.com/mosheng1/QuickClipboard/releases/latest'} 
                  target="_blank" 
                  rel="noreferrer"
                >
                  {t('updater.manualDownload', { defaultValue: '手动下载' })}
                </a>
              </div>
            )}
          </>
        )}

        <div className="flex gap-3 mt-2">
          {status === 'available' && (
            <>
              <button onClick={() => startDownload()} className="px-4 py-2 rounded bg-blue-600 text-white text-sm flex items-center gap-2">
                <i className="ti ti-download" /> {t('updater.downloadAndInstall', { defaultValue: '下载并安装' })}
              </button>
              {!forceUpdate && (
                <button onClick={handleClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-sm">
                  {t('updater.later', { defaultValue: '稍后' })}
                </button>
              )}
            </>
          )}
          {status === 'downloading' && !forceUpdate && (
            <button
              onClick={async () => {
                const w = getCurrentWebviewWindow();
                try { await w.hide(); } catch (_) {}
              }}
              className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-sm"
            >
              {t('updater.backgroundUpdate', { defaultValue: '后台更新' })}
            </button>
          )}
          {status === 'error' && (
            <>
              <button onClick={() => startDownload()} className="px-4 py-2 rounded bg-blue-600 text-white text-sm flex items-center gap-2">
                <i className="ti ti-refresh" /> {t('updater.retry', { defaultValue: '重试' })}
              </button>
              <button onClick={handleClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-sm flex items-center gap-2">
                {forceUpdate ? (
                  <><i className="ti ti-power" /> {t('updater.exitApp', { defaultValue: '退出程序' })}</>
                ) : (
                  <>{t('common.close', { defaultValue: '关闭' })}</>
                )}
              </button>
            </>
          )}
          {status === 'none' && (
            <button onClick={handleClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-sm">
              {t('common.close', { defaultValue: '关闭' })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

initStores().then(() => {
  createRoot(document.getElementById('root')).render(<App />)
})
