/*
  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  LIQUID GLASS — интерактивное «жидкое стекло» в стиле системных анимаций   ║
  ║  iOS. Метаболл-слияние форм (ртуть) + glassmorphism + органические spring. ║
  ╚══════════════════════════════════════════════════════════════════════════╝

  Метод рендера выбран из соображений производительности UI:
    • Слияние форм («ртуть») — SVG goo-фильтр (feGaussianBlur → feColorMatrix
      alpha-threshold). Это дешевле WebGL для нескольких мелких элементов,
      не требует своего canvas/контекста и масштабируется браузером бесплатно.
    • Стекло (blur фона, граница, specular) — нативный CSS backdrop-filter
      отдельным слоем (внутри SVG-фильтра backdrop-filter не работает).
    • Анимация — framer-motion spring (трансформы на GPU → стабильные 60 FPS).

  Использование:
    1) Один раз отрендерить <LiquidGlassDefs/> рядом с корнем приложения
       (он добавляет общий <filter id="lg-goo">).
    2) Использовать <LiquidGlassButton>, <LiquidGlassCard>, <LiquidGlassSegmented>.

  Кастомизация — через объект LIQUID_GLASS_CONFIG ниже либо через проп `config`.
*/

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { motion, useSpring, useReducedMotion } from 'framer-motion'
import '../styles/liquid-glass.css'

/* ───────────────────────────────────────────────────────────────────────────
   КОНФИГ — все ключевые настройки эффекта в одном месте.
   ─────────────────────────────────────────────────────────────────────────── */
export const LIQUID_GLASS_CONFIG = {
  // Стекло (glassmorphism)
  blur: 14,          // px — сила размытия заднего плана (backdrop-filter)
  surface: 0.14,     // 0..1 — плотность полупрозрачной подложки
  border: 0.35,      // 0..1 — яркость тонкой светлой границы (толщина стекла)
  radius: 9999,      // px — скругление (9999 = «пилюля»)

  // Вязкость слияния (метаболлы)
  viscosity: 8,      // stdDeviation goo-фильтра: больше → длиннее «ртутные» перемычки
  threshold: 19,     // контраст alpha-порога: чёткость границы слитой формы
  tint: 0.5,         // 0..1 — альфа тинт-блобов под стеклом (нужна для goo-порога)
  satelliteSize: 54, // px — диаметр блоба-спутника, тянущегося к курсору
  reach: 0.92,       // 0..1 — демпфирование хода спутника к курсору (1 = точно под курсор)

  // Геометрия контента
  padX: '1.5rem',    // горизонтальный паддинг контента
  padY: '0.75rem',   // вертикальный паддинг контента

  // Анимация (органика)
  spring: { stiffness: 280, damping: 26, mass: 0.9 }, // упругость перетекания формы
  rippleDuration: 600, // ms — жизнь капли при нажатии
}

/* Превращает конфиг в CSS-переменные для слоёв стекла. */
function glassVars(cfg) {
  return {
    '--lg-blur': `${cfg.blur}px`,
    '--lg-surface': cfg.surface,
    '--lg-border': cfg.border,
    '--lg-radius': cfg.radius >= 9999 ? '9999px' : `${cfg.radius}px`,
    '--lg-tint': `rgba(255, 255, 255, ${cfg.tint})`,
    '--lg-satellite-size': `${cfg.satelliteSize}px`,
    '--lg-pad-x': cfg.padX,
    '--lg-pad-y': cfg.padY,
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   <LiquidGlassDefs/> — общий SVG goo-фильтр. Рендерить ОДИН раз на приложение.

   Логика слияния форм:
     1. feGaussianBlur размывает альфа-канал блобов — их «облака» накладываются.
     2. feColorMatrix усиливает альфу (строка A: `0 0 0 threshold -offset`):
        полупрозрачные хвосты от размытия резко становятся либо непрозрачными,
        либо нулевыми. Там, где два размытых блоба перекрылись, суммарная альфа
        переваливает порог → между ними появляется гладкая перемычка без углов.
     3. feComposite atop возвращает исходные цвета поверх слитой альфа-маски.
   ─────────────────────────────────────────────────────────────────────────── */
export function LiquidGlassDefs({ config = LIQUID_GLASS_CONFIG }) {
  const cfg = { ...LIQUID_GLASS_CONFIG, ...config }
  // Смещение порога ≈ половина контраста → центр перехода на alpha 0.5.
  const offset = (cfg.threshold / 2).toFixed(2)
  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <filter id="lg-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation={cfg.viscosity} result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${cfg.threshold} -${offset}`}
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  )
}

/* Хук авто-ресайза: отдаёт актуальные размеры элемента через ResizeObserver. */
function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/* ───────────────────────────────────────────────────────────────────────────
   <LiquidGlassButton/> — кнопка со стеклом и вязким блобом-спутником.

   При наведении блоб-спутник тянется к курсору и через goo-фильтр остаётся
   вязко соединён с телом кнопки (ртуть). При уходе курсора spring возвращает
   его в центр — форма «расслаивается» и плавно сливается обратно.
   ─────────────────────────────────────────────────────────────────────────── */
export function LiquidGlassButton({
  children,
  config,
  className = '',
  fullWidth = false, // растянуть на всю ширину родителя (CTA в формах)
  accent = false,    // фирменный (--primary) тинт вместо нейтрального стекла
  onClick,
  ...rest
}) {
  const cfg = useMemo(() => ({ ...LIQUID_GLASS_CONFIG, ...config }), [config])
  const reduce = useReducedMotion()
  const rootRef = useRef(null)
  const { width, height } = useElementSize(rootRef)

  // Spring-координаты центра блоба-спутника (в пикселях относительно центра).
  const sx = useSpring(0, cfg.spring)
  const sy = useSpring(0, cfg.spring)
  const [ripples, setRipples] = useState([])

  const handlePointerMove = useCallback(
    (e) => {
      if (reduce) return
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      // Спутник тянется к курсору, но не дальше `reach` от центра — перемычка
      // остаётся достаточно короткой, чтобы goo-фильтр держал её слитной.
      const cx = r.width / 2
      const cy = r.height / 2
      sx.set((px - cx) * cfg.reach)
      sy.set((py - cy) * cfg.reach)
      // Позиция бегущего specular-блика на стекле.
      el.style.setProperty('--lg-mx', `${(px / r.width) * 100}%`)
      el.style.setProperty('--lg-my', `${(py / r.height) * 100}%`)
      el.style.setProperty('--lg-highlight', '1')
    },
    [reduce, sx, sy, cfg.reach]
  )

  const handlePointerLeave = useCallback(() => {
    sx.set(0)
    sy.set(0)
    rootRef.current?.style.setProperty('--lg-highlight', '0')
  }, [sx, sy])

  const handleClick = useCallback(
    (e) => {
      if (!reduce) {
        const el = rootRef.current
        const r = el.getBoundingClientRect()
        const id = Date.now() + Math.random()
        // Капля рождается в точке клика и отделяется от тела (расслоение ртути).
        setRipples((prev) => [
          ...prev,
          { id, x: e.clientX - r.left, y: e.clientY - r.top },
        ])
        setTimeout(
          () => setRipples((prev) => prev.filter((p) => p.id !== id)),
          cfg.rippleDuration
        )
      }
      onClick?.(e)
    },
    [reduce, onClick, cfg.rippleDuration]
  )

  return (
    <button
      ref={rootRef}
      className={`lg${fullWidth ? ' lg--block' : ''}${accent ? ' lg--accent' : ''} ${className}`}
      style={glassVars(cfg)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      {...rest}
    >
      {/* Слой «ртути» под goo-фильтром */}
      <span className="lg-goo">
        <span className="lg-blob lg-blob--body" />
        {!reduce && (
          <motion.span className="lg-blob lg-blob--satellite" style={{ x: sx, y: sy }} />
        )}
        {ripples.map((rp) => (
          <motion.span
            key={rp.id}
            className="lg-ripple"
            style={{ left: rp.x, top: rp.y }}
            initial={{ width: 8, height: 8, x: '-50%', y: '-50%', opacity: 0.9 }}
            animate={{
              width: Math.max(width, height) * 1.4,
              height: Math.max(width, height) * 1.4,
              opacity: 0,
            }}
            transition={{ duration: cfg.rippleDuration / 1000, ease: 'easeOut' }}
          />
        ))}
      </span>

      {/* Стеклянный слой (blur + граница + specular) */}
      <span className="lg-glass" />

      {/* Контент */}
      <span className="lg-content">{children}</span>
    </button>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
   <LiquidGlassCard/> — контентный блок-стекло с лёгким органическим
   подъёмом/морфингом при наведении.
   ─────────────────────────────────────────────────────────────────────────── */
export function LiquidGlassCard({ children, config, className = '', ...rest }) {
  const cfg = useMemo(() => ({ ...LIQUID_GLASS_CONFIG, ...config }), [config])
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={`lg-card ${className}`}
      style={glassVars({ ...cfg, radius: cfg.radius >= 9999 ? 28 : cfg.radius })}
      whileHover={reduce ? undefined : { scale: 1.015, borderRadius: 34 }}
      transition={{ type: 'spring', ...cfg.spring }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
   <LiquidGlassSegmented/> — сегментированный контрол. Активный «pill» —
   жидкая капля, которая перетекает между сегментами. Под goo-фильтром она при
   переходе вязко вытягивается и сливается с телом целевого сегмента — наглядное
   «слияние двух элементов» без острых углов.
   ─────────────────────────────────────────────────────────────────────────── */
export function LiquidGlassSegmented({
  options = [],
  value,
  onChange,
  config,
  className = '',
}) {
  const cfg = useMemo(() => ({ ...LIQUID_GLASS_CONFIG, ...config }), [config])
  const containerRef = useRef(null)
  const segRefs = useRef([])
  const [pill, setPill] = useState({ x: 0, width: 0 })

  const activeIndex = Math.max(0, options.findIndex((o) => valueOf(o) === value))

  // Пересчёт геометрии pill при смене значения и при ресайзе контейнера.
  const recalc = useCallback(() => {
    const seg = segRefs.current[activeIndex]
    const track = containerRef.current
    if (!seg || !track) return
    const sr = seg.getBoundingClientRect()
    const tr = track.getBoundingClientRect()
    setPill({ x: sr.left - tr.left, width: sr.width })
  }, [activeIndex])

  useEffect(() => {
    recalc()
  }, [recalc, value, options.length])

  useEffect(() => {
    const track = containerRef.current
    if (!track) return
    const ro = new ResizeObserver(recalc)
    ro.observe(track)
    return () => ro.disconnect()
  }, [recalc])

  return (
    <div ref={containerRef} className={`lg-segmented ${className}`} style={glassVars(cfg)}>
      {/* Жидкий трек с метаболл-перетеканием pill */}
      <div className="lg-segmented-track">
        <motion.div
          className="lg-segmented-pill"
          animate={{ x: pill.x, width: pill.width }}
          transition={{ type: 'spring', ...cfg.spring }}
        />
      </div>

      {options.map((opt, i) => {
        const val = valueOf(opt)
        const label = labelOf(opt)
        const active = val === value
        return (
          <button
            key={val}
            ref={(el) => (segRefs.current[i] = el)}
            type="button"
            className="lg-segment"
            data-active={active}
            onClick={() => onChange?.(val)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* options поддерживают как строки, так и { value, label }. */
function valueOf(opt) {
  return typeof opt === 'object' && opt !== null ? opt.value : opt
}
function labelOf(opt) {
  return typeof opt === 'object' && opt !== null ? opt.label : opt
}
