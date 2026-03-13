'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'

const links = [
  { href: '/',        label: 'Импорт',  icon: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )},
  { href: '/records', label: 'Записи', icon: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  )},
]

export default function NavBar({ onLogout }: { onLogout?: () => void }) {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <header
      className="fixed top-0 inset-x-0 z-40 h-14 flex items-center px-5"
      style={{
        background: 'rgba(13,22,41,0.82)',
        backdropFilter: 'blur(20px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Brand */}
      <Link href="/" className="flex items-center gap-2.5 mr-6 shrink-0 select-none">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-md opacity-50"
            style={{ background: 'radial-gradient(circle, #3772ff, transparent)' }}
          />
          <img src="/logo.png" alt="TengriLake.Ai" className="relative h-7 w-auto" />
        </div>
        <span className="text-white/20 text-xs font-light mx-0.5">×</span>
        <div style={{ isolation: 'isolate' }}>
          <img src="/logo.svg" alt="planning.gov.kz" className="h-6 w-auto opacity-75"
               style={{ transform: 'translateZ(0)', willChange: 'transform' }} />
        </div>
        <div className="leading-none ml-1">
          <p className="text-white/90 font-semibold text-[13px] tracking-tight">RGF Import</p>
          <p className="text-white/30 text-[9px] tracking-[0.18em] uppercase mt-0.5 font-medium">
            planning.gov.kz
          </p>
        </div>
      </Link>

      {/* Divider */}
      <div className="h-5 w-px bg-white/[0.08] mr-5" />

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {links.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
              style={active ? {
                background: 'linear-gradient(135deg, rgba(55,114,255,0.25), rgba(99,102,241,0.18))',
                color: '#93b4ff',
                border: '1px solid rgba(55,114,255,0.30)',
                boxShadow: '0 0 12px rgba(55,114,255,0.12)',
              } : {
                color: 'rgba(255,255,255,0.45)',
                border: '1px solid transparent',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)'
                  ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                }
              }}
            >
              <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">

        {/* Status dot */}
        <div className="flex items-center gap-1.5 mr-1">
          <div className="relative w-1.5 h-1.5">
            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
            <div className="absolute inset-0 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[10px] text-white/25 uppercase tracking-[0.18em] font-medium hidden sm:block">
            Алматы
          </span>
        </div>

        <div className="h-4 w-px bg-white/[0.08] mx-1" />

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'
            ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          {theme === 'dark' ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {onLogout && (
          <>
            <div className="h-4 w-px bg-white/[0.08] mx-1" />
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium uppercase tracking-wider transition-all duration-150"
              style={{ color: 'rgba(255,255,255,0.30)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#f87171'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.30)'
                ;(e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Выйти
            </button>
          </>
        )}
      </div>
    </header>
  )
}
