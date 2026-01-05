import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

let listenersInitialized = false
let listenersInitializing = false
let unlistenHierarchy = null
let unlistenClear = null

let currentHierarchy = null
const subscribers = new Set()

// 深度比较两个层级数据是否相同
function isHierarchyEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (!Array.isArray(a.hierarchy) || !Array.isArray(b.hierarchy)) return false
  if (a.hierarchy.length !== b.hierarchy.length) return false
  if (a.currentIndex !== b.currentIndex) return false
  
  for (let i = 0; i < a.hierarchy.length; i++) {
    const rectA = a.hierarchy[i]
    const rectB = b.hierarchy[i]
    if (rectA.x !== rectB.x || rectA.y !== rectB.y || 
        rectA.width !== rectB.width || rectA.height !== rectB.height) {
      return false
    }
  }
  
  return true
}

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
  if (listenersInitialized || listenersInitializing) return
  listenersInitializing = true

  try {
    unlistenHierarchy = await listen('auto-selection-hierarchy', (event) => {
      const payload = event.payload
      let newHierarchy = null
      
      if (!payload || !Array.isArray(payload.hierarchy) || payload.hierarchy.length === 0) {
        newHierarchy = null
      } else {
        newHierarchy = {
          hierarchy: payload.hierarchy,
          currentIndex: payload.current_index ?? 0,
        }
      }
      
      // 只在数据真正变化时才通知
      if (!isHierarchyEqual(currentHierarchy, newHierarchy)) {
        currentHierarchy = newHierarchy
        notifySubscribers()
      }
    })

    unlistenClear = await listen('auto-selection-clear', () => {
      if (currentHierarchy !== null) {
        currentHierarchy = null
        notifySubscribers()
      }
    })

    listenersInitialized = true
  } catch (e) {
    console.error('[autoSelectionManager] failed to setup listeners:', e)
  } finally {
    listenersInitializing = false
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

  listenersInitialized = false
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
