// Free profile banner gradient presets.
//
// The chosen preset id is stored in profiles.banner_gradient (available to
// every user, not just Pro). We store an id rather than raw CSS so the value
// is always safe to inject into an inline style and easy to restyle globally.
// A Pro cover_url image, when present, takes visual priority over the gradient.

export const BANNER_GRADIENTS = [
  { id: 'aurora',   label: 'Aurora',   css: 'linear-gradient(135deg, #7e22ce 0%, #c026d3 50%, #06b6d4 100%)' },
  { id: 'sunset',   label: 'Sunset',   css: 'linear-gradient(135deg, #f97316 0%, #db2777 55%, #7c3aed 100%)' },
  { id: 'ocean',    label: 'Ocean',    css: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #4f46e5 100%)' },
  { id: 'forest',   label: 'Forest',   css: 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #15803d 100%)' },
  { id: 'fire',     label: 'Fire',     css: 'linear-gradient(135deg, #dc2626 0%, #ea580c 50%, #f59e0b 100%)' },
  { id: 'candy',    label: 'Candy',    css: 'linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #8b5cf6 100%)' },
  { id: 'midnight', label: 'Midnight', css: 'linear-gradient(135deg, #1e293b 0%, #312e81 50%, #4c1d95 100%)' },
  { id: 'gold',     label: 'Gold',     css: 'linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #fde68a 100%)' },
  { id: 'mint',     label: 'Mint',     css: 'linear-gradient(135deg, #10b981 0%, #22d3ee 50%, #3b82f6 100%)' },
  { id: 'rose',     label: 'Rose',     css: 'linear-gradient(135deg, #be123c 0%, #e11d48 50%, #fb7185 100%)' },
  { id: 'graphite', label: 'Graphite', css: 'linear-gradient(135deg, #18181b 0%, #3f3f46 50%, #52525b 100%)' },
]

export const DEFAULT_BANNER_GRADIENT_ID = 'aurora'

// Resolve a stored preset id (possibly null/empty/unknown) to a CSS gradient.
export function getBannerGradientCss(id) {
  const found = BANNER_GRADIENTS.find(g => g.id === id)
  return (found || BANNER_GRADIENTS[0]).css
}
