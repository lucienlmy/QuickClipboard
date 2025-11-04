import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { settingsStore } from '@shared/store/settingsStore'

// 展开动画
function animateExpand(container) {
  const duration = 400
  const startTime = performance.now()
  const targetHeight = window.innerHeight - 10

  container.style.height = '0'
  container.style.opacity = '0'
  container.style.overflow = 'hidden'

  //到达底部后反弹
  function easeWithBounce(t) {
    if (t < 0.6) {
      const normalized = t / 0.6
      return 1 - Math.pow(1 - normalized, 3)
    }
    else {
      const bouncePhase = (t - 0.6) / 0.4
      const bounceOffset = Math.cos(bouncePhase * Math.PI) * 0.025
      return 1 - bounceOffset * (1 - bouncePhase) 
    }
  }

  function animate(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1)
    const eased = easeWithBounce(progress)
    
    container.style.height = `${targetHeight * eased}px`
    container.style.opacity = Math.min(progress * 2, 1)

    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      container.style.height = 'calc(100vh - 10px)'
      container.style.opacity = '1'
    }
  }

  requestAnimationFrame(animate)
}

// 收起动画
function animateCollapse(container) {
  const duration = 200
  const startTime = performance.now()
  const startHeight = window.innerHeight

  container.style.height = 'calc(100vh - 10px)'
  container.style.opacity = '1'
  container.style.overflow = 'hidden'

  function animate(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1)
    const eased = Math.pow(progress, 2)
    
    container.style.height = `${startHeight * (1 - eased)}px`
    container.style.opacity = 1 - eased

    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      container.style.height = '0'
      container.style.opacity = '0'
    }
  }

  requestAnimationFrame(animate)
}

// 贴边显示弹动动画
function animateEdgeSnapBounce(container, direction = 'top') {
  const amplitude = 40 
  const duration = 500
  const startTime = performance.now()

  container.style.willChange = 'transform'

  function animate(currentTime) {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)

    const frequency = Math.PI * 3.5
    const damping = 5
    const displacement = amplitude * Math.exp(-damping * progress) * Math.cos(frequency * progress)

    let tx = 0, ty = 0
    switch (direction) {
      case 'top':
        ty = displacement
        break
      case 'bottom':
        ty = -displacement
        break
      case 'left':
        tx = displacement
        break
      case 'right':
        tx = -displacement
        break
    }

    container.style.transform = `translate(${tx}px, ${ty}px)`

    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      container.style.transform = 'none'
      container.style.willChange = 'auto'
    }
  }

  requestAnimationFrame(animate)
}

export function useWindowAnimation() {
  useEffect(() => {
    const container = document.querySelector('.main-container')
    if (!container) return

    const unlistenShow = listen('window-show-animation', () => {
      if (settingsStore.clipboardAnimationEnabled) {
        animateExpand(container)
      } else {
        container.style.height = 'calc(100vh - 10px)'
        container.style.opacity = '1'
      }
    })

    const unlistenHide = listen('window-hide-animation', () => {
      if (settingsStore.clipboardAnimationEnabled) {
        animateCollapse(container)
      } else {
        container.style.height = '0'
        container.style.opacity = '0'
      }
    })

    const unlistenEdgeBounce = listen('edge-snap-bounce-animation', (event) => {
      if (settingsStore.clipboardAnimationEnabled) {
        const direction = event.payload
        animateEdgeSnapBounce(container, direction)
      }
    })

    // 超时显示
    const fallbackTimer = setTimeout(() => {
      if (container.style.height !== 'calc(100vh - 10px)') {
        container.style.height = 'calc(100vh - 10px)'
        container.style.opacity = '1'
      }
    }, 200)

    return () => {
      unlistenShow.then(fn => fn())
      unlistenHide.then(fn => fn())
      unlistenEdgeBounce.then(fn => fn())
      clearTimeout(fallbackTimer)
    }
  }, [])
}

