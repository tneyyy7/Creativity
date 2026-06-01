/**
 * Returns an inline style object for nickname rendering.
 * Supports both flat hex colors (#RRGGBB) and CSS gradients (linear-gradient(...)).
 *
 * For gradients, uses the background-clip trick so the gradient is applied
 * directly to the text glyphs while keeping the element inline-friendly.
 *
 * @param {string|undefined|null} nicknameColor - the stored nickname_color value
 * @param {string} [fallback] - fallback color when nicknameColor is empty
 * @returns {object} React inline style object
 */
// Theme-aware default colour for nicknames without a custom colour.
// Resolves to near-white on the dark themes and dark ink on the light theme
// (per-theme value defined in src/styles/index.css), so default nicknames stay
// legible on every theme instead of vanishing against the light background.
const DEFAULT_NICKNAME_COLOR = 'hsl(var(--foreground))'

export function getNicknameStyle(nicknameColor, fallback) {
  if (!nicknameColor) {
    if (!fallback) return {}
    // A hard-coded white fallback is invisible on the light theme. Map the
    // common white fallback onto the theme token so it follows the active theme.
    const isHardWhite = /^(#fff(fff)?|white)$/i.test(fallback.trim())
    return { color: isHardWhite ? DEFAULT_NICKNAME_COLOR : fallback }
  }

  // Detect gradient values (they always start with "linear-gradient" or "radial-gradient")
  if (nicknameColor.startsWith('linear-gradient') || nicknameColor.startsWith('radial-gradient')) {
    return {
      background: nicknameColor,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    }
  }

  // Plain hex / rgb / named color
  return { color: nicknameColor }
}

// Nickname rules: English letters, digits, underscore, dot and hyphen; 1–10 characters.
export const NICKNAME_MAX_LENGTH = 10
const NICKNAME_PATTERN = /^[A-Za-z0-9_.-]{1,10}$/

/**
 * Strips any disallowed characters from a nickname as the user types and caps
 * the length. Keeps only English letters, digits, underscores, dots and hyphens.
 *
 * @param {string} value - raw input value
 * @returns {string} sanitized nickname
 */
export function sanitizeNickname(value) {
  return (value || '')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .slice(0, NICKNAME_MAX_LENGTH)
}

/**
 * Validates a nickname against the allowed pattern.
 *
 * @param {string} value - nickname to validate
 * @returns {boolean} true when the nickname is valid
 */
export function isValidNickname(value) {
  return NICKNAME_PATTERN.test(value || '')
}
