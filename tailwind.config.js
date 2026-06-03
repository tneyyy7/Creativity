/** @type {import('tailwindcss').Config} */

// The whole app uses Tailwind `purple-*` utilities as its accent colour.
// Instead of replacing them in markup, we redefine the `purple` palette so
// every shade derives from two CSS variables (--acc-h hue, --acc-s saturation)
// while keeping per-shade lightness. Switching the theme only changes those
// two variables (see src/styles/index.css), recolouring the entire app —
// at any opacity — with zero component changes. Default values reproduce the
// original Tailwind purple closely so the default theme is unchanged.
const accent = (lightness) => `hsl(var(--acc-h) var(--acc-s) ${lightness}% / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // The UI read a touch too heavy in every language. Shift the prominent
      // weights down one notch (the lighter ones stay put) so headings and
      // bold labels are a bit slimmer everywhere, with zero markup changes.
      // All target values map to weights already bundled (see main.jsx).
      fontWeight: {
        medium: '400',
        semibold: '500',
        bold: '500',
        extrabold: '600',
        black: '700',
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        purple: {
          50:  accent(97),
          100: accent(95),
          200: accent(90),
          300: accent(83),
          400: accent(75),
          500: accent(65),
          600: accent(56),
          700: accent(47),
          800: accent(39),
          900: accent(32),
          950: accent(21),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}
