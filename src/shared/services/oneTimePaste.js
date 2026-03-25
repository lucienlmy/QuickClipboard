const ONE_TIME_PASTE_STORAGE_KEY = 'tool-state-one-time-paste-button'
const ONE_TIME_PASTE_EVENT = 'one-time-paste-changed'

export function getOneTimePasteEnabled() {
  try {
    const raw = localStorage.getItem(ONE_TIME_PASTE_STORAGE_KEY)
    return raw ? JSON.parse(raw) === true : false
  } catch (error) {
    console.error('读取一次性粘贴状态失败:', error)
    return false
  }
}

export function setOneTimePasteEnabled(enabled) {
  const nextValue = Boolean(enabled)
  try {
    localStorage.setItem(ONE_TIME_PASTE_STORAGE_KEY, JSON.stringify(nextValue))
  } catch (error) {
    console.error('保存一次性粘贴状态失败:', error)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ONE_TIME_PASTE_EVENT, {
      detail: { enabled: nextValue }
    }))
  }

  return nextValue
}

export function toggleOneTimePasteEnabled() {
  return setOneTimePasteEnabled(!getOneTimePasteEnabled())
}

export function getOneTimePasteStorageKey() {
  return ONE_TIME_PASTE_STORAGE_KEY
}

export function getOneTimePasteEventName() {
  return ONE_TIME_PASTE_EVENT
}
