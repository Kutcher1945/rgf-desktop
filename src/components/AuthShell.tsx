'use client'

import { useState, useEffect, useRef } from 'react'
import NavBar from './NavBar'
import { authLogin } from '@/lib/api'

const AUTH_KEY = 'rgf_auth'

export default function AuthShell({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const loginRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setAuthed(localStorage.getItem(AUTH_KEY) === '1')
  }, [])

  useEffect(() => {
    if (authed === false) loginRef.current?.focus()
  }, [authed])

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
    try {
      await authLogin(login, password)
      localStorage.setItem(AUTH_KEY, '1')
      setAuthed(true)
    } catch (err: any) {
      setError(err.message)
      setPassword('')
      passwordRef.current?.focus()
    } finally {
      setLoading(false)
    }
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

          <p className="text-center text-gov-navy-light/20 text-[11px] mt-6 uppercase tracking-widest">
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
