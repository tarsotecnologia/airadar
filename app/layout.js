import './globals.css'

export const metadata = {
  title: 'Radar IA',
  description: 'Feed enxuto para acompanhar novas LLMs, papers e notícias de IA.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Radar IA'
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg'
  }
}

export const viewport = {
  themeColor: '#0b1020'
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <script dangerouslySetInnerHTML={{
          __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {})); }`
        }} />
      </body>
    </html>
  )
}
