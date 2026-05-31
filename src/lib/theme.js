// Centralised theme definitions and helpers.
//
// Themes are driven entirely by the `data-theme` attribute on <html>.
// All colour values live in src/styles/index.css (CSS variables) and in
// tailwind.config.js (the `purple` accent palette derives from --acc-h/--acc-s),
// so switching a theme never requires touching component markup.

export const THEMES = [
  // id      -> value written to data-theme + localStorage + profiles.theme
  // labelKey-> i18n key for the human-readable name
  // swatch  -> [background, accent] colours shown in the picker preview
  { id: 'purple', labelKey: 'theme_purple', swatch: ['#1c1130', '#9333ea'] },
  { id: 'dark',   labelKey: 'theme_black',  swatch: ['#09090b', '#a855f7'] },
  { id: 'light',  labelKey: 'theme_light',  swatch: ['#f8f7ff', '#9333ea'] },
  { id: 'ocean',  labelKey: 'theme_ocean',  swatch: ['#0a1929', '#0ea5e9'] },
]

export const DEFAULT_THEME = 'purple'
export const THEME_STORAGE_KEY = 'creativity_theme'

const isValid = (theme) => THEMES.some((t) => t.id === theme)

// Read the theme cached on this device (used for an instant, flicker-free
// first paint before the profile loads from the server).
export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isValid(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

// Apply a theme: update <html data-theme>, cache it locally and keep the
// browser chrome colour (PWA status bar) in sync.
export function applyTheme(theme) {
  const next = isValid(theme) ? theme : DEFAULT_THEME
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    /* ignore storage failures (private mode etc.) */
  }
  // Keep the mobile address-bar / PWA status-bar colour matching the theme.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const swatch = THEMES.find((t) => t.id === next)?.swatch[0]
    if (swatch) meta.setAttribute('content', swatch)
  }
  return next
}
