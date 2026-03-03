'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'

const links = [
  { href: '/',        label: 'Импорт' },
  // { href: '/records', label: 'Записи' },
]

export default function NavBar({ onLogout }: { onLogout?: () => void }) {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <header className="fixed top-0 inset-x-0 z-40 h-14 bg-gov-navy flex items-center px-6 shadow-md">
      {/* Brand */}
      <div className="flex items-center gap-3 mr-10">
        <img src="/logo.png" alt="Логотип" className="h-8 w-auto" />
        <div className="leading-none">
          <p className="text-white font-semibold text-sm">RGF Import</p>
          <p className="text-gov-navy-light/50 text-[10px] tracking-wide uppercase mt-0.5">
            planning.gov.kz
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-gov-navy-light/20 mr-6" />

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {links.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-gov-blue text-white'
                  : 'text-gov-navy-light/70 hover:text-white hover:bg-gov-navy-hover'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] text-gov-navy-light/40 uppercase tracking-widest font-medium">
          Алматы
        </span>
        <div className="w-2 h-2 rounded-full bg-gov-blue animate-pulse" />

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gov-navy-light/40 hover:text-white/80 hover:bg-gov-navy-light/10 transition-all"
        >
          {theme === 'dark' ? (
            /* Sun — switch to light */
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            /* Moon — switch to dark */
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {onLogout && (
          <>
            <div className="h-4 w-px bg-gov-navy-light/20 mx-1" />
            <button
              onClick={onLogout}
              className="text-[11px] text-gov-navy-light/40 hover:text-white/70 transition-colors uppercase tracking-wider font-medium"
            >
              Выйти
            </button>
          </>
        )}
      </div>
    </header>
  )
}
