import { useEffect } from 'react'

// Phone-only edge-swipe navigation, iOS-style:
//   • swipe in from the LEFT edge  → "go back one level" (onBack)
//   • swipe LEFT while the menu is open → close the menu (onCloseSidebar)
//
// We only ever read the gesture (never preventDefault), so vertical scrolling
// and in-page interactions keep working. The handlers are bound in the capture
// phase so a child calling stopPropagation can't swallow the gesture.
export function useNavigationGestures({ onBack, onCloseSidebar, isSidebarOpen }) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const EDGE = 30          // px from the left edge where a back-swipe may start
    const THRESHOLD = 70     // px of horizontal travel required to trigger
    const OFF_AXIS = 0.6     // |dy| must stay below |dx| * OFF_AXIS (keep it horizontal)
    const MAX_TIME = 700     // ms — longer drags are treated as scrolling, not a swipe

    let startX = 0
    let startY = 0
    let startT = 0
    let tracking = false
    let fromEdge = false

    const onStart = (e) => {
      const t = e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      startT = Date.now()
      tracking = true
      fromEdge = startX <= EDGE
    }

    const onEnd = (e) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Date.now() - startT > MAX_TIME) return
      if (Math.abs(dy) > Math.abs(dx) * OFF_AXIS) return // too vertical → it's a scroll

      if (isSidebarOpen) {
        // Menu is open: a leftward swipe (from anywhere) closes it.
        if (dx < -THRESHOLD) onCloseSidebar()
        return
      }
      // Menu closed: a rightward swipe that started at the left edge goes back.
      if (fromEdge && dx > THRESHOLD) onBack()
    }

    const opts = { passive: true, capture: true }
    const mq = window.matchMedia('(max-width: 767px)')
    let bound = false

    const bind = () => {
      if (bound) return
      window.addEventListener('touchstart', onStart, opts)
      window.addEventListener('touchend', onEnd, opts)
      bound = true
    }
    const unbind = () => {
      if (!bound) return
      window.removeEventListener('touchstart', onStart, opts)
      window.removeEventListener('touchend', onEnd, opts)
      bound = false
    }
    const apply = () => (mq.matches ? bind() : unbind())

    apply()
    mq.addEventListener('change', apply)
    return () => {
      mq.removeEventListener('change', apply)
      unbind()
    }
  }, [onBack, onCloseSidebar, isSidebarOpen])
}
