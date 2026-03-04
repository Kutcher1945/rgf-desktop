'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import NavBar from './NavBar'
import { authLogin } from '@/lib/api'

const AUTH_KEY = 'rgf_auth'
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://exp-admin.smartalmaty.kz'

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
      await authLogin(login, password)
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
      <div className="min-h-screen bg-gov-navy-darker flex items-center justify-center p-4">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative w-full max-w-sm">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.png" alt="Логотип" className="h-14 w-auto mb-4 drop-shadow-lg" />
            <h1 className="text-white text-xl font-semibold">RGF Import Tool</h1>
            <p className="text-gov-navy-light/40 text-xs mt-1 uppercase tracking-widest">planning.gov.kz</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-modal overflow-hidden">
            <div className="bg-gov-navy px-6 py-5 border-b border-white/5">
              <p className="text-white font-semibold text-sm">Вход в систему</p>
              <p className="text-gov-navy-light/50 text-xs mt-0.5">Введите логин и пароль для доступа</p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider mb-1.5">
                  Логин
                </label>
                <input
                  ref={loginRef}
                  type="text"
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                  placeholder="Введите логин"
                  autoComplete="username"
                  className="w-full px-4 py-2.5 rounded-xl border border-gov-grey-light focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/10 outline-none text-sm text-gov-navy transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider mb-1.5">
                  Пароль
                </label>
                <input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 rounded-xl border border-gov-grey-light focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/10 outline-none text-sm text-gov-navy transition-all"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                  <span className="shrink-0 mt-0.5">✗</span>
                  <span className="whitespace-pre-wrap break-words">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !login.trim() || !password.trim()}
                className="w-full py-2.5 bg-gov-blue hover:bg-gov-blue-hover active:bg-gov-blue-active disabled:bg-gov-blue/40 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Проверка...
                  </span>
                ) : 'Войти'}
              </button>
            </form>
          </div>

          {/* Debug logs panel */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowLogs(v => !v)}
                className="text-[10px] text-gov-navy-light/30 hover:text-gov-navy-light/60 transition-colors px-1"
              >
                {showLogs ? '▲ Скрыть логи' : '▼ Логи отладки'}{logs.length > 0 ? ` (${logs.length})` : ''}
              </button>
              {showLogs && logs.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copyLogs}
                    className="text-[10px] text-gov-navy-light/30 hover:text-gov-navy-light/60 transition-colors px-1"
                  >
                    Копировать
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="text-[10px] text-gov-navy-light/30 hover:text-gov-navy-light/60 transition-colors px-1"
                  >
                    Очистить
                  </button>
                </div>
              )}
            </div>

            {showLogs && (
              <div className="mt-1.5 bg-black/85 rounded-xl p-3 text-[10px] font-mono text-green-400 max-h-52 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-white/30 italic">Нет записей. Попробуйте войти.</p>
                ) : (
                  logs.map((l, i) => (
                    <p
                      key={i}
                      className="whitespace-pre-wrap break-all leading-relaxed"
                      style={{ color: l.includes('✗') ? '#f87171' : l.startsWith('[') && l.includes('───') ? '#facc15' : undefined }}
                    >
                      {l}
                    </p>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>

          <p className="text-center text-gov-navy-light/20 text-[11px] mt-4 uppercase tracking-widest">
            Алматы · Акимат
          </p>
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
