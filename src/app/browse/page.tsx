'use client'

import { useState, useEffect, useCallback } from 'react'
import { browseRecords } from '@/lib/api'
import type { PositionDepartmentItem } from '@/lib/api'

type BrowseTab = 'upravlenie' | 'otdel' | 'department'

const TABS: { key: BrowseTab; label: string; type: number }[] = [
  { key: 'department',  label: 'Департамент', type: 3 },
  { key: 'upravlenie', label: 'Управление',   type: 4 },
  { key: 'otdel',      label: 'Отдел',        type: 5 },
]

const STATUS_COLOR: Record<string, string> = {
  APPROVED:    '#34d399',
  DRAFT:       '#fbbf24',
  IN_PROGRESS: '#60a5fa',
}

function Spinner() {
  return (
    <div className="py-20 flex flex-col items-center gap-3">
      <div className="w-6 h-6 border-2 rounded-full animate-spin"
           style={{ borderColor: 'var(--border-md)', borderTopColor: '#3772ff' }} />
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>Загрузка...</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-24 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
           style={{ background: 'rgba(55,114,255,0.1)' }}>
        <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Нет записей</p>
    </div>
  )
}

export default function BrowsePage() {
  const [tab, setTab] = useState<BrowseTab>('upravlenie')
  const [items, setItems]   = useState<PositionDepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const currentType = TABS.find(t => t.key === tab)!.type

  const load = useCallback(async (type: number) => {
    setLoading(true); setError(null)
    try {
      const r = await browseRecords(type)
      setItems(r.content ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSearch('')
    load(currentType)
  }, [tab, currentType, load])

  const filtered = search.trim()
    ? items.filter(it =>
        (it.guName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (it.departmentName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (it.committeeName ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : items

  return (
    <div className="w-full px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
            Реестр положений
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Данные с planning.gov.kz · {items.length} записей
          </p>
        </div>
        <button
          onClick={() => load(currentType)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface-hover)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Обновить
        </button>
      </div>

      {/* Tabs + search row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl"
             style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={tab === key
                ? { background: 'var(--surface-hover)', color: 'var(--text-1)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }
                : { color: 'var(--text-3)' }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
               style={{ color: 'var(--text-4)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm border outline-none"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
            }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm border border-red-500/20"
             style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--badge-err-fg)' }}>
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState /> : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                {['ID', 'Организация', 'Статус', 'Задачи', 'Права', 'Обяз.', 'Функции', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: 'var(--text-4)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const name = item.guName || item.departmentName || item.committeeName || '—'
                const statusCode = item.statusObj?.code ?? ''
                const statusLabel = item.statusObj?.nameRu ?? statusCode
                const statusColor = STATUS_COLOR[statusCode] ?? 'var(--text-4)'
                const url = `https://planning.gov.kz/rgffront#/rgffront/filter/positions/department/${item.id}/edit`
                return (
                  <tr key={item.id}
                      style={{ borderBottom: '1px solid var(--divide)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[11px] font-bold px-2 py-1 rounded-md"
                            style={{ background: 'rgba(55,114,255,0.15)', color: '#60a5fa' }}>
                        #{item.id}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 max-w-[280px]">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{name}</p>
                      {item.departmentName && item.departmentName !== name && (
                        <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-4)' }}>{item.departmentName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {statusLabel && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                          <span style={{ color: statusColor }}>{statusLabel}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                      {item.tasks?.length ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                      {item.authoritiesLaw?.length ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                      {item.authoritiesResponsibilities?.length ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                      {item.functions?.length ?? '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <a href={url} target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                         style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
                         onMouseEnter={e => {
                           (e.currentTarget as HTMLElement).style.background = 'rgba(55,114,255,0.15)'
                           ;(e.currentTarget as HTMLElement).style.color = '#60a5fa'
                           ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(55,114,255,0.3)'
                         }}
                         onMouseLeave={e => {
                           (e.currentTarget as HTMLElement).style.background = ''
                           ;(e.currentTarget as HTMLElement).style.color = 'var(--text-3)'
                           ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                         }}>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
