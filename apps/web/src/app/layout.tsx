import type { Metadata } from 'next'
import { Playfair_Display, Source_Sans_3 } from 'next/font/google'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/components/providers/SessionProvider'
import './globals.css'

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-playfair-display',
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
        className={`${playfairDisplay.variable} ${sourceSans3.variable} font-sans bg-cream text-ink antialiased`}
        suppressHydrationWarning
      >
        <SessionProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </SessionProvider>
      </body>
    </html>
  )
}
