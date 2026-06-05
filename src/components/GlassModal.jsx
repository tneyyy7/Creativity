import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/*
  ╔══════════════════════════════════════════════════════════════════════════╗
  ║  GLASS MODAL — единый «жидкое стекло» для всех модальных окон / поп-апов.  ║
  ║  Эталон стиля — панель «Пожаловаться» (Report Content).                    ║
  ╚══════════════════════════════════════════════════════════════════════════╝

  Используй <GlassModal> как обёртку (оверлей + стеклянная карточка + крестик),
  <GlassModalHeader> для шапки с иконкой, и токены классов ниже для полей,
  плашек выбора и кнопок действия — чтобы все окна выглядели одинаково.
*/

// ── Токены классов: единый источник правды для содержимого окон ──────────────

// Служебный заголовок секции (мелкий, серый, верхний регистр).
export const glassSectionLabel =
  'text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2'

// Кликабельная плашка выбора варианта.
export const glassOption =
  'w-full bg-white/[0.03] hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl p-4 text-sm text-gray-300 transition-all text-left'

// Активная плашка выбора.
export const glassOptionActive =
  'bg-purple-600/15 border-purple-500/30 text-purple-200'

// Текстовое поле / textarea.
export const glassInput =
  'w-full bg-white/[0.03] border border-white/5 focus:border-white/15 focus:outline-none rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-500 transition-all'

// Кнопка действия — общая база (цвет добавляй отдельным токеном).
export const glassActionBase =
  'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-white border border-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed'

// Цветовые варианты кнопки действия.
export const glassActionPrimary =
  'bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border-purple-500/20'
export const glassActionDanger =
  'bg-red-500/15 hover:bg-red-500/25 text-red-200 border-red-500/20'
export const glassActionNeutral =
  'bg-white/[0.04] hover:bg-white/10 text-gray-300'

/**
 * Обёртка модального окна: затемнённый размытый оверлей + стеклянная карточка.
 *
 * @param onClose       — закрытие (по крестику и по клику на оверлей).
 * @param showClose     — показывать крестик (по умолчанию true).
 * @param closeOnBackdrop — закрывать по клику на фон (по умолчанию true).
 * @param maxWidth      — Tailwind-класс ширины (по умолчанию max-w-md).
 * @param z             — Tailwind z-index оверлея (по умолчанию z-[200]).
 * @param padding       — Tailwind-класс внутреннего паддинга карточки.
 * @param cardClassName — доп. классы карточки (например, flex/overflow для списков).
 */
export function GlassModal({
  children,
  onClose,
  showClose = true,
  closeOnBackdrop = true,
  maxWidth = 'max-w-md',
  z = 'z-[200]',
  padding = 'p-6',
  cardClassName = '',
}) {
  return createPortal(
    <div
      className={`fixed inset-0 ${z} flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 font-sans`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`relative w-full ${maxWidth} bg-[#15141d]/75 backdrop-blur-xl border border-white/10 rounded-3xl ${padding} shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${cardClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showClose && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}

/**
 * Шапка окна: иконка в цветной полупрозрачной подложке + заголовок и подзаголовок.
 *
 * @param icon      — JSX иконки (например, <Flag className="w-4 h-4" />).
 * @param iconClass — классы подложки иконки (фон/рамка/цвет).
 * @param title     — заголовок окна.
 * @param subtitle  — подзаголовок (опционально).
 */
export function GlassModalHeader({
  icon,
  iconClass = 'bg-purple-500/15 border border-purple-400/30 text-purple-300',
  title,
  subtitle,
}) {
  return (
    <div className="flex items-center gap-2.5 mb-5 pr-10">
      {icon && (
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-white tracking-tight truncate">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-400 truncate">{subtitle}</p>}
      </div>
    </div>
  )
}
