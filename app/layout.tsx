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
      {/* suppressHydrationWarning covers ONLY this element's own attributes, not its children, so a
          real mismatch inside the app still reports. Browser extensions write to <body> before React
          hydrates -- Grammarly adds data-gr-ext-installed and data-new-gr-c-s-check-loaded -- which
          React counts as a server/client mismatch on every page. This is the documented remedy for
          extension-injected attributes; it is not papering over one of ours. */}
      <body className="antialiased" suppressHydrationWarning>
        <GameProvider>{children}</GameProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
