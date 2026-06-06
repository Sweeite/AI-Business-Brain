import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI Business Brain',
  description: 'Organisational memory for your business',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
