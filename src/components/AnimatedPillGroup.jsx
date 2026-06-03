/*
  AnimatedPillGroup — сегментированный переключатель в стиле Telegram / Liquid Glass.

  Активная «капля» (motion.span с общим layoutId) плавно ПЕРЕТЕКАЕТ между кнопками
  при переключении: framer-motion сам анимирует FLIP-переход, поэтому капля всегда
  идеально совпадает с реальным размером кнопки и ничего не «съезжает» — это надёжнее
  ручного измерения координат.

  Важно: внешний вид кнопок и контейнера задаётся СНАРУЖИ через className-пропсы,
  чтобы не менять уже готовую вёрстку на страницах — мы лишь добавляем анимацию
  поверх существующих переключателей.

  Использование:
    <AnimatedPillGroup
      value={value}
      onChange={setValue}
      options={[{ value, label, icon? }, ...]}
      containerClassName="<классы контейнера-обёртки как в оригинале>"
      buttonClassName="<базовые классы каждой кнопки как в оригинале, БЕЗ active-стиля>"
      pillVariant="glass" | "solid"   // вид перетекающей капли
      pillClassName="rounded-xl"        // форма капли (совпадает со скруглением кнопки)
    />
*/

import { useId } from 'react'
import { motion } from 'framer-motion'

const PILL_STYLES = {
  // Стеклянный фирменный градиент (как .lg-pill--active)
  glass: {
    background: 'linear-gradient(160deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary) / 0.55) 100%)',
    border: '1px solid hsl(var(--primary) / 0.7)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 3px 12px hsl(var(--primary) / 0.4)',
  },
  // Плотная фиолетовая заливка (как bg-purple-600 + shadow-purple)
  solid: {
    background: 'rgb(147 51 234)',
    boxShadow: '0 10px 22px -6px rgba(88, 28, 135, 0.45)',
  },
}

export function AnimatedPillGroup({
  value,
  onChange,
  options = [],
  containerClassName = '',
  buttonClassName = '',
  activeClassName = 'text-white',
  inactiveClassName = 'text-gray-400 hover:text-white',
  pillClassName = 'rounded-xl',
  pillVariant = 'glass',
  contentClassName = '',
}) {
  // Уникальный layoutId на каждый экземпляр группы — капля летает ТОЛЬКО внутри
  // своей группы и не путается с другими переключателями на странице.
  const pillId = useId()

  return (
    <div className={containerClassName}>
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative ${buttonClassName} ${isActive ? activeClassName : inactiveClassName}`}
            // У активной кнопки гасим её собственную заливку/кромку/стекло —
            // видимый фон даёт перетекающая капля под текстом. borderColor (а не
            // border) не меняет толщину, поэтому размеры кнопок не «прыгают».
            style={isActive ? {
              background: 'transparent',
              borderColor: 'transparent',
              boxShadow: 'none',
              WebkitBackdropFilter: 'none',
              backdropFilter: 'none',
            } : undefined}
          >
            {isActive && (
              <motion.span
                layoutId={pillId}
                aria-hidden="true"
                className={`absolute inset-0 ${pillClassName}`}
                style={{ zIndex: 0, ...PILL_STYLES[pillVariant] }}
                transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}
              />
            )}
            <span className={`relative z-10 inline-flex items-center justify-center gap-1.5 ${contentClassName}`}>
              {opt.icon}
              {opt.label != null && <span>{opt.label}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
