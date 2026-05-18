export const OPTIONAL_TAB_OPTIONS = [
  { id: 'favorites', labelKey: 'favorites.title', fallbackLabel: '收藏' },
  { id: 'emoji', labelKey: 'emoji.title', fallbackLabel: '符号' },
  { id: 'chat', labelKey: 'chat.title', fallbackLabel: '聊天' }
]

export const DEFAULT_VISIBLE_OPTIONAL_TABS = OPTIONAL_TAB_OPTIONS.map(option => option.id)

export function normalizeVisibleOptionalTabs(value) {
  const input = Array.isArray(value) ? value : DEFAULT_VISIBLE_OPTIONAL_TABS
  const allowed = new Set(DEFAULT_VISIBLE_OPTIONAL_TABS)
  const normalized = []

  input.forEach(id => {
    if (allowed.has(id) && !normalized.includes(id)) {
      normalized.push(id)
    }
  })

  return normalized
}

export function getVisibleMainTabs(visibleOptionalTabs) {
  return ['clipboard', ...normalizeVisibleOptionalTabs(visibleOptionalTabs)]
}

export function isMainTabVisible(tabId, visibleOptionalTabs) {
  return getVisibleMainTabs(visibleOptionalTabs).includes(tabId)
}
