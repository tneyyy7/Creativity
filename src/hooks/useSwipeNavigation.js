import { useCallback, useEffect, useRef } from 'react'

/**
 * Full-width horizontal swipe paging between screens — native mobile UX
 * (tab-pager style: swipe left → next page, swipe right → previous page).
 *
 * Design notes / safety guarantees:
 *   • We NEVER call preventDefault on a vertical gesture, so the page keeps
 *     its native vertical scroll. We also never preventDefault at all (the
 *     listeners stay passive), so clicks and inner horizontal carousels are
 *     untouched — navigation fires on touchend via a state change.
 *   • A gesture only counts as a horizontal swipe when it is clearly
 *     horizontal (|dx| > |dy| * 1.5, i.e. within ~34° of horizontal) AND it
 *     travels past the threshold (or is fast enough).
 *   • Multitouch (pinch/zoom) is ignored.
 *   • Gestures that begin inside a horizontally-scrollable element (image
 *     carousels, category chips, etc.) are ignored so they keep scrolling.
 *
 * @typedef {Object} SwipeOptions
 * @property {() => void} [onSwipeLeft]   Called on a confirmed left swipe → next page.
 * @property {() => void} [onSwipeRight]  Called on a confirmed right swipe → previous page.
 * @property {number} [threshold=80]      Minimum |deltaX| in px to trigger.
 * @property {number} [velocityThreshold=0.3] Minimum |deltaX|/ms to trigger regardless of threshold.
 * @property {boolean} [disabled=false]   Disable swipe handling (e.g. inside a scroll container / modal open).
 * @property {import('react').RefObject<HTMLElement>} [ref] Optional element to bind listeners to.
 *           If omitted, attach the returned `swipeHandlers` to a JSX element instead.
 *
 * @param {SwipeOptions} [options]
 * @returns {{ swipeHandlers: {
 *   onTouchStart: (e: import('react').TouchEvent) => void,
 *   onTouchMove:  (e: import('react').TouchEvent) => void,
 *   onTouchEnd:   (e: import('react').TouchEvent) => void,
 * } }}
 */
export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  velocityThreshold = 0.3,
  disabled = false,
  ref,
} = {}) {
  // Tuning constants for gesture identification.
  const MIN_TRAVEL = 40   // px — discard tiny accidental touches
  const ANGLE_RATIO = 1.5 // |dx| must exceed |dy| * 1.5 to be "horizontal"

  // Per-gesture mutable state kept in a ref so re-renders don't reset it.
  const state = useRef({
    startX: 0,
    startY: 0,
    startT: 0,
    tracking: false,
    /** true once we decide the gesture is inside a horizontal scroller and bail */
    blocked: false,
  })

  // Walk up from the touch target: if any ancestor can scroll horizontally,
  // the user is most likely scrolling that element, not paging between screens.
  const startsInHorizontalScroller = (target) => {
    let node = target
    while (node && node !== document.body) {
      if (node.nodeType === 1) {
        const style = window.getComputedStyle(node)
        const ox = style.overflowX
        if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 1) {
          return true
        }
      }
      node = node.parentNode
    }
    return false
  }

  const onTouchStart = useCallback((e) => {
    const s = state.current
    // Ignore multitouch (pinch-zoom etc.).
    if (disabled || e.touches.length > 1) {
      s.tracking = false
      return
    }
    const t = e.touches[0]
    s.startX = t.clientX
    s.startY = t.clientY
    s.startT = e.timeStamp || Date.now()
    s.tracking = true
    s.blocked = startsInHorizontalScroller(e.target)
  }, [disabled])

  const onTouchMove = useCallback((e) => {
    const s = state.current
    if (!s.tracking) return
    // A second finger landed mid-gesture → abandon (it became a pinch/zoom).
    if (e.touches.length > 1) s.tracking = false
    // NOTE: we intentionally never preventDefault here, so native vertical
    // scroll and inner horizontal scrollers keep working.
  }, [])

  const onTouchEnd = useCallback((e) => {
    const s = state.current
    if (!s.tracking) return
    s.tracking = false
    if (s.blocked) return

    const t = e.changedTouches[0]
    if (!t) return

    const dx = t.clientX - s.startX
    const dy = t.clientY - s.startY
    const dt = Math.max(1, (e.timeStamp || Date.now()) - s.startT)
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    // Reject anything that isn't clearly a horizontal swipe.
    if (absX < MIN_TRAVEL) return
    if (absX <= absY * ANGLE_RATIO) return // too vertical → leave it to native scroll

    const velocity = absX / dt
    const passed = absX > threshold || velocity > velocityThreshold
    if (!passed) return

    // dx > 0 → finger moved right → go to the PREVIOUS page (iOS "back").
    // dx < 0 → finger moved left  → go to the NEXT page.
    if (dx > 0) onSwipeRight?.()
    else onSwipeLeft?.()
  }, [onSwipeLeft, onSwipeRight, threshold, velocityThreshold])

  // Optional document/element binding variant. When a `ref` is supplied we
  // attach native listeners (passive) and clean them up on unmount/disable.
  useEffect(() => {
    const el = ref?.current
    if (!el || disabled) return

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [ref, disabled, onTouchStart, onTouchMove, onTouchEnd])

  return {
    swipeHandlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
