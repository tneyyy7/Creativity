import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { LiquidGlassDefs } from './components/LiquidGlass'
import { initLiquidGlassAuto } from './lib/liquidGlassAuto'
// Self-hosted Inter (all weights used across the app, incl. Cyrillic subsets).
// Bundled locally so the font never depends on Google Fonts being reachable.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/900.css'
import './styles/index.css'
import './styles/liquid-glass-global.css'
import './i18n/config'
import { initObservability, ErrorBoundary } from './lib/observability'

// Error tracking + product analytics (no-op unless env keys are set).
initObservability()

// Глобальный Liquid Glass: блик за курсором + ртутный ripple на всех карточках,
// панелях и главных кнопках сайта (через делегирование событий, в т.ч. для
// динамически подгружаемого контента).
initLiquidGlassAuto()

function AppErrorFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0b11', color: '#fff', fontFamily: 'Inter, sans-serif', textAlign: 'center', padding: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Something went wrong</h1>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>The error was logged. Please reload the page.</p>
        <button onClick={() => window.location.reload()} style={{ padding: '0.6rem 1.5rem', borderRadius: '1rem', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Reload</button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Общий SVG goo-фильтр для эффекта Liquid Glass — один раз на всё приложение,
        до экранов авторизации, чтобы стеклянные кнопки работали везде. */}
    <LiquidGlassDefs />
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// Push notifications are owned entirely by OneSignal's service worker
// (registered in initOneSignal at scope '/'). A custom '/sw.js' used to be registered
// here as well, but two service workers cannot both control scope '/': the custom one
// — registered on every load with skipWaiting()/clients.claim() — kept evicting
// OneSignal's worker, which the push subscription is bound to, and silently killed all
// push delivery. We no longer register it, and we proactively unregister any stale copy
// left on devices that installed it previously so OneSignal's worker can take over.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => {
        const scriptURL =
          reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (scriptURL.endsWith('/sw.js')) {
          reg.unregister().then(() => console.log('Removed legacy /sw.js worker'));
        }
      });
    });
  });
}
