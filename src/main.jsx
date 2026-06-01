import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'
import './i18n/config'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
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
