import { useEffect } from 'react'

// Phone-only swipe navigation, native-mobile style:
//   • swipe RIGHT starting near the LEFT edge → contextual "back" (onBack):
//       in a chat → back to the chat list, on a nested view → back,
//       on a top-level page → open the burger menu.
//   • swipe LEFT while the menu is open → close the menu (onCloseSidebar).
//   • swipe LEFT while the menu is closed → "forward" (onForward), e.g. step
//       forward through browser history.
//
// We only ever read the gesture (never preventDefault), so vertical scrolling
// and in-page interactions keep working. The handlers are bound in the capture
// phase so a child calling stopPropagation can't swallow the gesture. Gestures
// that begin inside a horizontally-scrollable element (image carousels, the
// category chips, etc.) are ignored so those keep scrolling normally.
export function useNavigationGestures({ onBack, onForward, onCloseSidebar, isSidebarOpen }) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const EDGE = 60          // px from the left edge where a back-swipe may start
    const THRESHOLD = 70     // px of horizontal travel required to trigger
    const OFF_AXIS = 0.6     // |dy| must stay below |dx| * OFF_AXIS (keep it horizontal)
    const MAX_TIME = 700     // ms — longer drags are treated as scrolling, not a swipe

    let startX = 0
    let startY = 0
    let startT = 0
    let tracking = false
    let fromEdge = false
    let blocked = false      // gesture began inside a horizontal scroller → ignore

    // Walk up from the touch target: if any ancestor scrolls horizontally the
    // user is most likely scrolling it, not navigating between screens.
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
      fromEdge = startX <= EDGE
      blocked = startsInHorizontalScroller(e.target)
    }

    const onEnd = (e) => {
      if (!tracking) return
      tracking = false
      if (blocked) return
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Date.now() - startT > MAX_TIME) return
      if (Math.abs(dy) > Math.abs(dx) * OFF_AXIS) return // too vertical → it's a scroll

      if (isSidebarOpen) {
        // Menu is open: a leftward swipe (from anywhere) closes it.
        if (dx < -THRESHOLD) onCloseSidebar?.()
        return
      }
      // Menu closed:
      //   • a rightward swipe that started at the left edge goes "back".
      //   • a leftward swipe goes "forward".
      if (fromEdge && dx > THRESHOLD) onBack?.()
      else if (dx < -THRESHOLD) onForward?.()
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
  }, [onBack, onForward, onCloseSidebar, isSidebarOpen])
}
