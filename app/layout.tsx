import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { GameProvider } from '@/lib/game/game-context'
import './globals.css'

export const metadata: Metadata = {
  title: 'Adaptive Learning Game',
  description:
    'A gamified adaptive-learning platform — quizzes and games that adapt to your level.',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <GameProvider>{children}</GameProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
