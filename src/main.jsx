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

// Глобальный Liquid Glass: блик за курсором + ртутный ripple на всех карточках,
// панелях и главных кнопках сайта (через делегирование событий, в т.ч. для
// динамически подгружаемого контента).
initLiquidGlassAuto()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Общий SVG goo-фильтр для эффекта Liquid Glass — один раз на всё приложение,
        до экранов авторизации, чтобы стеклянные кнопки работали везде. */}
    <LiquidGlassDefs />
    <App />
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
