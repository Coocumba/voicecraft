/** @type {import('tailwindcss').Config} */
const config = {
  content: [],
  theme: {
    extend: {
      colors: {
        cream: 'rgb(var(--color-cream) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        white: 'rgb(var(--color-white) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['var(--font-heading, "Lora")', 'Georgia', 'serif'],
        sans: ['var(--font-body, "Source Sans 3")', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: 'max(calc(var(--radius, 8px) - 4px), 0px)',
        DEFAULT: 'var(--radius, 8px)',
        md: 'var(--radius, 8px)',
        lg: 'calc(var(--radius, 8px) + 4px)',
        xl: 'calc(var(--radius, 8px) + 8px)',
        '2xl': 'calc(var(--radius, 8px) + 12px)',
      },
    },
  },
  plugins: [],
}

module.exports = config
