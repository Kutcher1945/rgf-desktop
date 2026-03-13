'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import NavBar from './NavBar'
import { authLogin, setAuthToken, clearAuthToken } from '@/lib/api'

const AUTH_KEY = 'rgf_auth'
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

export default function AuthShell({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const loginRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toISOString().substring(11, 23)
    setLogs(prev => [...prev, `[${ts}] ${msg}`])
  }, [])

  useEffect(() => {
    setAuthed(localStorage.getItem(AUTH_KEY) === '1')
  }, [])

  useEffect(() => {
    if (authed === false) loginRef.current?.focus()
  }, [authed])

  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, showLogs])

  const handleLogout = () => {
    clearAuthToken()
    localStorage.removeItem(AUTH_KEY)
    setLogin('')
    setPassword('')
    setError(null)
    setAuthed(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!login.trim() || !password.trim()) return
    setLoading(true)
    setError(null)

    // Capture environment info on each attempt
    addLog('─── Login attempt ───')
    addLog(`URL: ${BASE}/api/rgf/auth/`)
    addLog(`navigator.onLine: ${navigator.onLine}`)
    addLog(`Tauri context: ${!!(window as any).__TAURI_INTERNALS__}`)
    addLog(`UA: ${navigator.userAgent.slice(0, 100)}`)

    try {
      const token = await authLogin(login, password)
      setAuthToken(token)
      addLog('✓ Success')
      localStorage.setItem(AUTH_KEY, '1')
      setAuthed(true)
    } catch (err: any) {
      // Raw plugin error (attached by api.ts)
      if (err.__raw) {
        addLog(`RAW type: ${err.__raw.type}`)
        addLog(`RAW str:  ${err.__raw.str}`)
        addLog(`RAW json: ${err.__raw.json}`)
      }
      addLog(`✗ name: ${err?.name}`)
      addLog(`✗ message: ${err?.message}`)
      if (err?.cause != null) addLog(`✗ cause: ${String(err.cause)}`)
      if (err?.stack) {
        String(err.stack).split('\n').slice(0, 4).forEach(l => addLog(`  ${l.trim()}`))
      }
      setError(err?.message ?? String(err))
      setPassword('')
      passwordRef.current?.focus()
      setShowLogs(true)
    } finally {
      setLoading(false)
    }
  }

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n')).catch(() => {})
  }

  // Still hydrating
  if (authed === null) return null

  if (!authed) {
    return (
      <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4"
           style={{ background: 'radial-gradient(ellipse at 20% 50%, #0a1628 0%, #060d1a 60%, #03080f 100%)' }}>

        {/* ── Animated orbs ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="login-orb-1 absolute w-[520px] h-[520px] rounded-full opacity-[0.22]"
               style={{ top: '-120px', left: '-80px',
                        background: 'radial-gradient(circle, #3772ff 0%, transparent 70%)' }} />
          <div className="login-orb-2 absolute w-[420px] h-[420px] rounded-full opacity-[0.18]"
               style={{ bottom: '-100px', right: '-60px',
                        background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
          <div className="login-orb-3 absolute w-[300px] h-[300px] rounded-full opacity-[0.12]"
               style={{ top: '40%', left: '55%',
                        background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)' }} />
        </div>

        {/* ── Noise texture / grid ── */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{
               backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)',
               backgroundSize: '48px 48px',
             }} />

        {/* ── Center column ── */}
        <div className="relative w-full max-w-[360px] flex flex-col items-center">

          {/* Logo + title */}
          <div className="login-logo flex flex-col items-center mb-7 select-none">
            {/* Dual logo row */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full opacity-40 blur-xl"
                     style={{ background: 'radial-gradient(circle, #3772ff, transparent)' }} />
                <img src="/logo.png" alt="TengriLake.Ai"
                     className="logo-glow relative h-14 w-auto" />
              </div>
              <span className="text-white/20 text-xl font-light">×</span>
              <div style={{ isolation: 'isolate' }}>
                <img src="/logo.svg" alt="planning.gov.kz"
                     className="h-14 w-auto opacity-90"
                     style={{ transform: 'translateZ(0)', willChange: 'transform' }} />
              </div>
            </div>
            <h1 className="text-white text-[22px] font-bold tracking-tight"
                style={{ textShadow: '0 0 40px rgba(55,114,255,0.4)' }}>
              RGF Import Tool
            </h1>
            <p className="text-white/25 text-[10px] mt-1.5 uppercase tracking-[0.22em] font-medium">
              planning.gov.kz · Алматы
            </p>
          </div>

          {/* Glass card */}
          <div className="login-card glass-card w-full rounded-2xl overflow-hidden">

            {/* Card header stripe */}
            <div className="px-6 pt-6 pb-5 border-b border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                       style={{ background: 'linear-gradient(135deg,#3772ff,#6366f1)' }}>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-white/90 font-semibold text-sm leading-tight">Вход в систему</p>
                  <p className="text-white/35 text-[11px] mt-0.5">Введите учётные данные для доступа</p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

              {/* Login field */}
              <div className="login-f1">
                <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">
                  Логин
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </span>
                  <input
                    ref={loginRef}
                    type="text"
                    value={login}
                    onChange={e => setLogin(e.target.value)}
                    placeholder="Введите логин"
                    autoComplete="username"
                    className="login-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white/90 placeholder-white/20 border border-white/10"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="login-f2">
                <label className="block text-[10px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2">
                  Пароль
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </span>
                  <input
                    ref={passwordRef}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="login-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white/90 placeholder-white/20 border border-white/10"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="login-f3 flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-xs text-red-300 border border-red-500/20"
                     style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span className="whitespace-pre-wrap break-words leading-relaxed">{error}</span>
                </div>
              )}

              {/* Submit */}
              <div className="login-f4 pt-1">
                <button
                  type="submit"
                  disabled={loading || !login.trim() || !password.trim()}
                  className="btn-shimmer w-full py-2.5 text-white font-semibold text-sm rounded-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Проверка...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Войти
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Debug logs panel */}
          <div className="login-footer w-full mt-3">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setShowLogs(v => !v)}
                className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
              >
                {showLogs ? '▲ Скрыть логи' : '▼ Логи отладки'}{logs.length > 0 ? ` (${logs.length})` : ''}
              </button>
              {showLogs && logs.length > 0 && (
                <div className="flex gap-3">
                  <button type="button" onClick={copyLogs}
                          className="text-[10px] text-white/20 hover:text-white/50 transition-colors">
                    Копировать
                  </button>
                  <button type="button" onClick={() => setLogs([])}
                          className="text-[10px] text-white/20 hover:text-white/50 transition-colors">
                    Очистить
                  </button>
                </div>
              )}
            </div>

            {showLogs && (
              <div className="mt-1.5 rounded-xl p-3 text-[10px] font-mono text-green-400 max-h-52 overflow-y-auto border border-white/[0.06]"
                   style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
                {logs.length === 0 ? (
                  <p className="text-white/30 italic">Нет записей. Попробуйте войти.</p>
                ) : (
                  logs.map((l, i) => (
                    <p key={i} className="whitespace-pre-wrap break-all leading-relaxed"
                       style={{ color: l.includes('✗') ? '#f87171' : l.includes('───') ? '#facc15' : undefined }}>
                      {l}
                    </p>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <NavBar onLogout={handleLogout} />
      <main className="pt-14 min-h-screen">
        {children}
      </main>
    </>
  )
}
