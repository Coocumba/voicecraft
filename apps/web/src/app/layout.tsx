import type { Metadata } from 'next'
import { Lora, Source_Sans_3 } from 'next/font/google'
import './globals.css'

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
})

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-source-sans-3',
})

export const metadata: Metadata = {
  title: {
    default: 'VoiceCraft',
    template: '%s · VoiceCraft',
  },
  description: 'Craft compelling voices with AI.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${lora.variable} ${sourceSans3.variable} font-sans bg-cream text-ink antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
