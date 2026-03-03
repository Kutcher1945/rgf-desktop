import type { Metadata } from 'next'
import './globals.css'
import AuthShell from '@/components/AuthShell'
import { ThemeProvider } from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'RGF Import Tool',
  description: 'Импорт положений на planning.gov.kz',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <AuthShell>{children}</AuthShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
