import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

let listening = false
let unlistenHierarchy = null
let unlistenClear = null

let currentHierarchy = null
const subscribers = new Set()

function notifySubscribers() {
  for (const cb of subscribers) {
    try {
      cb(currentHierarchy)
    } catch (e) {
      console.error('[autoSelectionManager] subscriber error:', e)
    }
  }
}

async function ensureListeners() {
  if (listening) return

  try {
    unlistenHierarchy = await listen('auto-selection-hierarchy', (event) => {
      const payload = event.payload
      if (!payload || !Array.isArray(payload.hierarchy) || payload.hierarchy.length === 0) {
        currentHierarchy = null
      } else {
        currentHierarchy = {
          hierarchy: payload.hierarchy,
          currentIndex: payload.current_index ?? 0,
        }
      }
      notifySubscribers()
    })

    unlistenClear = await listen('auto-selection-clear', () => {
      currentHierarchy = null
      notifySubscribers()
    })

    listening = true
  } catch (e) {
    console.error('[autoSelectionManager] failed to setup listeners:', e)
  }
}

export async function ensureAutoSelectionStarted() {
  await ensureListeners()
  try {
    await invoke('request_auto_selection_emit')
  } catch (e) {
    console.error('[autoSelectionManager] failed to request emit:', e)
  }
}

export async function stopAutoSelection() {
  if (unlistenHierarchy) {
    try { unlistenHierarchy() } catch (_) {}
    unlistenHierarchy = null
  }
  if (unlistenClear) {
    try { unlistenClear() } catch (_) {}
    unlistenClear = null
  }

  listening = false
  currentHierarchy = null
  subscribers.clear()
}

export function subscribe(callback) {
  subscribers.add(callback)

  return () => {
    subscribers.delete(callback)
  }
}

export function getCurrentHierarchy() {
  return currentHierarchy
}
