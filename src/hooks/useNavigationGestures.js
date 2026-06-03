import { useEffect } from 'react'

export function useNavigationGestures({ onBack, onForward, onCloseSidebar, isSidebarOpen }) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const EDGE = 60          // px from the left edge where a back-swipe may start
    const THRESHOLD = 80     // px of horizontal travel required to trigger
    const MAX_TIME = 700     // ms — longer drags are ignored as slow scrolls
    const SIDEBAR_WIDTH = 288 // px

    let startX = 0
    let startY = 0
    let startT = 0
    let tracking = false
    let isVertical = false
    let isHorizontal = false
    let fromEdge = false
    let targetElement = null // 'sidebar-open' | 'sidebar-close' | 'chat' | 'profile' | null
    let activeEl = null      // DOM element being dragged
    let backdropEl = null    // backdrop element if dragging sidebar
    let blocked = false      // gesture began inside a horizontal scroller

    // Walk up from the touch target: if any ancestor scrolls horizontally the
    // user is most likely scrolling it, not navigating.
    const startsInHorizontalScroller = (target) => {
      let node = target
      while (node && node !== document.body) {
        if (node.nodeType === 1) {
          const ox = window.getComputedStyle(node).overflowX
          if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 1) {
            return true
          }
        }
        node = node.parentNode
      }
      return false
    }

    const onStart = (e) => {
      if (e.touches.length > 1) { tracking = false; return } // ignore multitouch
      const t = e.touches[0]
      if (!t) return

      startX = t.clientX
      startY = t.clientY
      startT = Date.now()
      tracking = true
      isHorizontal = false
      isVertical = false
      fromEdge = startX <= EDGE
      blocked = startsInHorizontalScroller(e.target)
      targetElement = null
      activeEl = null
      backdropEl = null

      // Determine drag target
      if (isSidebarOpen) {
        // If sidebar is open, any horizontal drag to the left closes it
        const sidebar = document.getElementById('app-sidebar')
        const backdrop = document.getElementById('sidebar-backdrop')
        if (sidebar && backdrop) {
          targetElement = 'sidebar-close'
          activeEl = sidebar
          backdropEl = backdrop
        }
      } else {
        // Sidebar is closed.
        // Check for fullscreen chat room first
        const chatPanel = document.getElementById('mobile-chat-panel')
        if (chatPanel) {
          if (fromEdge) {
            targetElement = 'chat'
            activeEl = chatPanel
          }
        } else {
          // Check for public profile
          const profilePage = document.getElementById('public-profile-page')
          if (profilePage) {
            if (fromEdge) {
              targetElement = 'profile'
              activeEl = profilePage
            }
          } else {
            // Top-level page. Swiping from left edge opens sidebar
            const sidebar = document.getElementById('app-sidebar')
            const backdrop = document.getElementById('sidebar-backdrop')
            if (sidebar && backdrop && fromEdge) {
              targetElement = 'sidebar-open'
              activeEl = sidebar
              backdropEl = backdrop
            }
          }
        }
      }
    }

    const onMove = (e) => {
      if (!tracking || blocked) return
      const t = e.touches[0]
      if (!t) return

      const dx = t.clientX - startX
      const dy = t.clientY - startY

      // Lock direction if not yet locked
      if (!isHorizontal && !isVertical) {
        const absX = Math.abs(dx)
        const absY = Math.abs(dy)
        if (absX > 8 || absY > 8) {
          if (absY > absX * 0.8) {
            isVertical = true
            tracking = false
            return
          } else {
            isHorizontal = true
          }
        } else {
          return // need more distance to decide
        }
      }

      if (isHorizontal && targetElement && activeEl) {
        // Prevent default window scrolling / rubber-banding
        if (e.cancelable) {
          e.preventDefault()
        }

        // Apply drag transform
        if (targetElement === 'sidebar-open') {
          // dx is positive (dragging right)
          const dragX = Math.max(0, Math.min(SIDEBAR_WIDTH, dx))
          activeEl.style.transition = 'none'
          activeEl.style.transform = `translate3d(${dragX - SIDEBAR_WIDTH}px, 0, 0)`
          if (backdropEl) {
            backdropEl.style.transition = 'none'
            backdropEl.style.pointerEvents = 'auto'
            backdropEl.style.opacity = `${(dragX / SIDEBAR_WIDTH) * 0.6}`
          }
        } else if (targetElement === 'sidebar-close') {
          // dx is negative (dragging left)
          const dragX = Math.min(0, Math.max(-SIDEBAR_WIDTH, dx))
          activeEl.style.transition = 'none'
          activeEl.style.transform = `translate3d(${dragX}px, 0, 0)`
          if (backdropEl) {
            backdropEl.style.transition = 'none'
            backdropEl.style.opacity = `${((SIDEBAR_WIDTH + dragX) / SIDEBAR_WIDTH) * 0.6}`
          }
        } else if (targetElement === 'chat' || targetElement === 'profile') {
          // dx is positive (dragging right to go back)
          const dragX = Math.max(0, dx)
          activeEl.style.transition = 'none'
          activeEl.style.transform = `translate3d(${dragX}px, 0, 0)`
        }
      }
    }

    const onEnd = (e) => {
      if (!tracking) return
      tracking = false
      if (blocked || !isHorizontal || !targetElement || !activeEl) return

      const t = e.changedTouches[0]
      if (!t) return

      const dx = t.clientX - startX
      const duration = Date.now() - startT

      // Determine velocity: distance / time
      const velocity = Math.abs(dx) / (duration || 1) // px per ms
      const isSwipeFast = velocity > 0.3 && duration < MAX_TIME

      if (targetElement === 'sidebar-open') {
        const dragX = Math.max(0, Math.min(SIDEBAR_WIDTH, dx))
        const triggerOpen = dragX > THRESHOLD || (isSwipeFast && dx > 20)

        // Set clean transition style
        activeEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        if (backdropEl) {
          backdropEl.style.transition = 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }

        if (triggerOpen) {
          activeEl.style.transform = 'translate3d(0, 0, 0)'
          if (backdropEl) {
            backdropEl.style.opacity = '0.6'
            backdropEl.style.pointerEvents = 'auto'
          }
          // Notify React state
          onBack?.()
        } else {
          activeEl.style.transform = `translate3d(${-SIDEBAR_WIDTH}px, 0, 0)`
          if (backdropEl) {
            backdropEl.style.opacity = '0'
            backdropEl.style.pointerEvents = 'none'
          }
          onCloseSidebar?.()
        }
      } else if (targetElement === 'sidebar-close') {
        const dragX = Math.min(0, Math.max(-SIDEBAR_WIDTH, dx))
        const triggerClose = Math.abs(dragX) > THRESHOLD || (isSwipeFast && dx < -20)

        activeEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        if (backdropEl) {
          backdropEl.style.transition = 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }

        if (triggerClose) {
          activeEl.style.transform = `translate3d(${-SIDEBAR_WIDTH}px, 0, 0)`
          if (backdropEl) {
            backdropEl.style.opacity = '0'
            backdropEl.style.pointerEvents = 'none'
          }
          onCloseSidebar?.()
        } else {
          activeEl.style.transform = 'translate3d(0, 0, 0)'
          if (backdropEl) {
            backdropEl.style.opacity = '0.6'
            backdropEl.style.pointerEvents = 'auto'
          }
        }
      } else if (targetElement === 'chat') {
        const triggerBack = dx > THRESHOLD || (isSwipeFast && dx > 20)

        activeEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'

        if (triggerBack) {
          // Slide completely off screen
          activeEl.style.transform = 'translate3d(100%, 0, 0)'
          // Wait for transition to complete before triggering state change (so user sees animation!)
          setTimeout(() => {
            onBack?.()
          }, 250)
        } else {
          activeEl.style.transform = 'translate3d(0, 0, 0)'
        }
      } else if (targetElement === 'profile') {
        const triggerBack = dx > THRESHOLD || (isSwipeFast && dx > 20)

        activeEl.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'

        if (triggerBack) {
          activeEl.style.transform = 'translate3d(100%, 0, 0)'
          setTimeout(() => {
            onBack?.()
          }, 250)
        } else {
          activeEl.style.transform = 'translate3d(0, 0, 0)'
        }
      }
    }

    const optsMove = { passive: false, capture: true }
    const optsStartEnd = { passive: true, capture: true }
    const mq = window.matchMedia('(max-width: 1024px)') // Enable for mobile + tablet viewports
    let bound = false

    const bind = () => {
      if (bound) return
      window.addEventListener('touchstart', onStart, optsStartEnd)
      window.addEventListener('touchmove', onMove, optsMove)
      window.addEventListener('touchend', onEnd, optsStartEnd)
      bound = true
    }
    const unbind = () => {
      if (!bound) return
      window.removeEventListener('touchstart', onStart, optsStartEnd)
      window.removeEventListener('touchmove', onMove, optsMove)
      window.removeEventListener('touchend', onEnd, optsStartEnd)
      bound = false
    }
    const apply = () => (mq.matches ? bind() : unbind())

    apply()
    mq.addEventListener('change', apply)
    return () => {
      mq.removeEventListener('change', apply)
      unbind()
    }
  }, [onBack, onForward, onCloseSidebar, isSidebarOpen])
}
