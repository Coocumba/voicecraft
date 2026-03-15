import type { Config } from 'tailwindcss'
import baseConfig from '@voicecraft/config/tailwind'

const config: Config = {
  ...baseConfig,
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
}

export default config
