/*
  LIQUID GLASS — авто-применение по всему сайту.
  ------------------------------------------------
  Через делегирование событий на document навешивает «жидко-стеклянный» эффект
  на все основные поверхности (карточки, панели, главные кнопки) — включая те,
  что подгружаются динамически (лента, модалки), без MutationObserver.

  Эффект внедряется лениво: оверлей создаётся при первом наведении/нажатии,
  поэтому стоимость нулевая, пока пользователь не взаимодействует с элементом.

  Стили слоёв — в styles/liquid-glass-global.css.
*/

// Поверхности, получающие стеклянную кромку + блик за курсором: карточки/панели
// и главные кнопки/пилюли. Можно расширить, добавив элементу [data-lg-fx].
const SELECTOR = '.glass-card, .lg-pill, .bg-purple-600, .bg-purple-500, [data-lg-fx]'

// Ртутный ripple вешаем ТОЛЬКО на кнопко-подобные элементы (кнопки, пилюли),
// но НЕ на крупные контентные панели — иначе капля раздувается на всю карточку
// и выглядит как «засветка всей страницы».
const RIPPLE_SELECTOR = 'button, .lg-pill, [role="button"], [data-lg-fx]'

// Не трогаем уже «настоящие» Liquid Glass-компоненты.
const EXCLUDE = '.lg, .lg-card, .lg-segmented'

const RIPPLE_MS = 600
const RIPPLE_MAX = 260 // px — жёсткий потолок диаметра капли (защита от гигантских ripple)

// Блик НЕ показываем на крупных контентных панелях (это «большие блоки», которые
// не должны подсвечиваться). Кнопки/пилюли — исключение, им блик можно всегда.
const MAX_PANEL_W = 560
const MAX_PANEL_H = 480

function findHost(node) {
  if (!node || !node.closest) return null
  if (node.closest(EXCLUDE)) return null
  return node.closest(SELECTOR)
}

// Можно ли подсвечивать этот хост? Кнопки/пилюли — всегда. Прочее (карточки/
// панели) — только если это не «большой блок».
function sheenAllowed(host, rect) {
  if (host.matches(RIPPLE_SELECTOR)) return true
  return rect.width <= MAX_PANEL_W && rect.height <= MAX_PANEL_H
}

// Лениво создаёт (и кэширует) оверлей внутри хоста.
function ensureOverlay(host) {
  if (host.__lgOverlay && host.__lgOverlay.isConnected) return host.__lgOverlay
  host.classList.add('lg-fx-host')
  const overlay = document.createElement('span')
  overlay.className = 'lg-fx-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  // Вставляем первым ребёнком: position:absolute убирает его из потока,
  // поэтому на flex/grid-раскладку это не влияет.
  host.insertBefore(overlay, host.firstChild)
  host.__lgOverlay = overlay
  return overlay
}

export function initLiquidGlassAuto() {
  if (typeof document === 'undefined' || document.__lgAutoInit) return
  document.__lgAutoInit = true

  let hot = null // текущий «подсвеченный» хост
  let rafId = 0
  let pending = null // { host, mx, my }

  const flush = () => {
    rafId = 0
    if (!pending) return
    const { host, mx, my } = pending
    host.style.setProperty('--lg-mx', `${mx}%`)
    host.style.setProperty('--lg-my', `${my}%`)
    pending = null
  }

  // Снимает подсветку с текущего хоста (при уходе курсора с элемента / из окна).
  const clearHot = () => {
    if (hot) {
      hot.removeAttribute('data-lg-hot')
      hot = null
    }
  }

  // Specular-блик следует за курсором (rAF-троттлинг → стабильные 60 FPS).
  document.addEventListener(
    'pointermove',
    (e) => {
      let host = findHost(e.target)
      const r = host ? host.getBoundingClientRect() : null
      // Большие блоки не подсвечиваем вовсе.
      if (host && !sheenAllowed(host, r)) host = null
      if (hot && hot !== host) hot.removeAttribute('data-lg-hot')
      if (!host) {
        hot = null
        return
      }
      ensureOverlay(host)
      host.setAttribute('data-lg-hot', '1')
      hot = host
      pending = {
        host,
        mx: ((e.clientX - r.left) / r.width) * 100,
        my: ((e.clientY - r.top) / r.height) * 100,
      }
      if (!rafId) rafId = requestAnimationFrame(flush)
    },
    { passive: true }
  )

  // Гасим подсветку, когда курсор покидает окно/документ (иначе «залипает»).
  document.addEventListener('pointerleave', clearHot)
  document.addEventListener('pointercancel', clearHot)
  window.addEventListener('blur', clearHot)

  // Ртутная капля от точки нажатия — только на кнопко-подобных элементах.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.target || !e.target.closest) return
      if (e.target.closest(EXCLUDE)) return
      // Хост капли — ближайшая КНОПКА/пилюля, а не крупная панель.
      const host = e.target.closest(RIPPLE_SELECTOR)
      if (!host) return
      const overlay = ensureOverlay(host)
      const r = host.getBoundingClientRect()
      // Потолок размера: капля не должна раздуваться больше RIPPLE_MAX.
      const size = Math.min(Math.max(r.width, r.height) * 1.25, RIPPLE_MAX)

      const ripple = document.createElement('span')
      ripple.className = 'lg-fx-ripple'
      ripple.style.left = `${e.clientX - r.left}px`
      ripple.style.top = `${e.clientY - r.top}px`
      ripple.style.width = '0px'
      ripple.style.height = '0px'
      ripple.style.opacity = '0.6'
      overlay.appendChild(ripple)

      // Запускаем рост на следующем кадре, чтобы сработал transition.
      requestAnimationFrame(() => {
        ripple.style.transition = `width ${RIPPLE_MS}ms ease, height ${RIPPLE_MS}ms ease, opacity ${RIPPLE_MS}ms ease`
        ripple.style.width = `${size}px`
        ripple.style.height = `${size}px`
        ripple.style.opacity = '0'
      })
      setTimeout(() => ripple.remove(), RIPPLE_MS + 50)
    },
    { passive: true }
  )
}
