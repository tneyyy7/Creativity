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
export function getNicknameStyle(nicknameColor, fallback) {
  if (!nicknameColor) {
    return fallback ? { color: fallback } : {}
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
