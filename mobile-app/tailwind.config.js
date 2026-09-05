/** @type {import('tailwindcss').Config} */
module.exports = {
  // Desktop-only design system. Scoped to components under src/desktop/ and
  // src/pages/desktop/ so Tailwind's utility classes never appear in the
  // existing mobile-first inline-style codebase - the two coexist without
  // conflicting. corePlugins.preflight is off below for the same reason:
  // Tailwind's base reset is a global stylesheet, and mobile has no CSS
  // classes to defend itself with, so a global reset would silently change
  // its rendering too.
  content: ['./src/desktop/**/*.{js,jsx}', './src/pages/desktop/**/*.{js,jsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#111827',
          light: '#1f2937',
        },
        accent: {
          DEFAULT: '#C9A227',
          light: '#F5E6A3',
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Segoe UI'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", "'Fira Code'", 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        popover: '0 12px 32px rgba(15,23,42,0.12), 0 4px 12px rgba(15,23,42,0.06)',
      },
    },
  },
  plugins: [],
}
