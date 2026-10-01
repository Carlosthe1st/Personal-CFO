import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Personal CFO — Clareza para o teu negócio',
  description: 'O teu dia a dia financeiro, finalmente claro.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  )
}
