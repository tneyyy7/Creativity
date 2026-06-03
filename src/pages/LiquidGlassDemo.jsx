/*
  Демонстрация эффекта Liquid Glass. Самодостаточная страница: показывает
  кнопки, карточку и сегментированный контрол на «живом» фоне, чтобы был виден
  backdrop-filter и метаболл-слияние форм.
*/

import { useState } from 'react'
import { Sparkles, Heart, Compass } from 'lucide-react'
import {
  LiquidGlassDefs,
  LiquidGlassButton,
  LiquidGlassCard,
  LiquidGlassSegmented,
} from '../components/LiquidGlass'

export default function LiquidGlassDemo() {
  const [tab, setTab] = useState('home')

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2.5rem',
        padding: '3rem',
        // «Живой» фон, сквозь который читается стеклянное размытие.
        background:
          'radial-gradient(circle at 20% 20%, #6d28d9, transparent 45%),' +
          'radial-gradient(circle at 80% 30%, #db2777, transparent 45%),' +
          'radial-gradient(circle at 50% 80%, #2563eb, transparent 50%), #0c0b11',
      }}
    >
      {/* Общий goo-фильтр — один раз на приложение */}
      <LiquidGlassDefs />

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <LiquidGlassButton onClick={() => {}}>
          <Sparkles size={18} /> Создать
        </LiquidGlassButton>
        <LiquidGlassButton onClick={() => {}}>
          <Heart size={18} /> Нравится
        </LiquidGlassButton>
        <LiquidGlassButton onClick={() => {}}>
          <Compass size={18} /> Исследовать
        </LiquidGlassButton>
      </div>

      <LiquidGlassSegmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'home', label: 'Главная' },
          { value: 'feed', label: 'Лента' },
          { value: 'pro', label: 'PRO' },
        ]}
      />

      <LiquidGlassCard style={{ maxWidth: 360, padding: '1.75rem' }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: '1.15rem' }}>Жидкое стекло</h3>
        <p style={{ margin: '0.6rem 0 0', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
          Наведите курсор на кнопки — блоб вязко тянется к курсору и сливается
          с телом. Нажмите — капля отделяется (эффект ртути).
        </p>
      </LiquidGlassCard>
    </div>
  )
}
