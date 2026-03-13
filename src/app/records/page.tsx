'use client'

import { useState, useEffect, useCallback } from 'react'
import { getRecords, getAuditLog, deleteRecords } from '@/lib/api'
import type { ImportedRecord, AuditLogEntry } from '@/lib/api'

type Tab = 'imports' | 'audit'

const ACTION_META: Record<string, { label: string; color: string; dot: string }> = {
  login:   { label: 'Вход',     color: 'text-indigo-400',  dot: 'bg-indigo-400' },
  preview: { label: 'Просмотр', color: 'text-sky-400',     dot: 'bg-sky-400'    },
  import:  { label: 'Импорт',   color: 'text-emerald-400', dot: 'bg-emerald-400'},
  delete:  { label: 'Удаление', color: 'text-red-400',     dot: 'bg-red-400'    },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  success: { label: 'OK',        color: 'var(--badge-ok-fg)',   bg: 'var(--badge-ok-bg)',   dot: 'bg-emerald-400' },
  skipped: { label: 'Пропущен',  color: 'var(--badge-warn-fg)', bg: 'var(--badge-warn-bg)', dot: 'bg-amber-400'   },
  error:   { label: 'Ошибка',    color: 'var(--badge-err-fg)',  bg: 'var(--badge-err-bg)',  dot: 'bg-red-400'     },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'только что'
  if (m < 60) return `${m} мин. назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч. назад`
  return `${Math.floor(h / 24)} д. назад`
}

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent: string
}) {
  return (
    <div className="card flex items-center gap-4 px-5 py-4">
      <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: accent }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-3)' }}>{label}</p>
        <p className="text-2xl font-bold leading-tight mt-0.5" style={{ color: 'var(--text-1)' }}>{value}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function RecordsPage() {
  const [tab, setTab] = useState<Tab>('imports')

  const [records, setRecords]           = useState<ImportedRecord[]>([])
  const [selected, setSelected]         = useState<Set<number>>(new Set())
  const [loadingRecords, setLoadingRec] = useState(true)
  const [deleting, setDeleting]         = useState(false)
  const [recError, setRecError]         = useState<string | null>(null)
  const [message, setMessage]           = useState<string | null>(null)

  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditError, setAuditError]     = useState<string | null>(null)

  const loadRecords = useCallback(async () => {
    setLoadingRec(true); setRecError(null)
    try   { const r = await getRecords(); setRecords(r.records) }
    catch (e: any) { setRecError(e.message) }
    finally { setLoadingRec(false) }
  }, [])

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true); setAuditError(null)
    try   { const r = await getAuditLog(); setAuditEntries(r.entries) }
    catch (e: any) { setAuditError(e.message) }
    finally { setLoadingAudit(false) }
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])
  useEffect(() => { if (tab === 'audit' && auditEntries.length === 0) loadAudit() }, [tab, loadAudit, auditEntries.length])

  const successRecords = records.filter(r => r.status === 'success' && r.record_id != null)
  const allSelected    = successRecords.length > 0 && selected.size === successRecords.length
  const someSelected   = selected.size > 0 && selected.size < successRecords.length
  const toggleAll      = () => setSelected(allSelected ? new Set() : new Set(successRecords.map(r => r.record_id!)))
  const toggleOne      = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleDelete = async (ids: number[]) => {
    if (!ids.length) return
    if (!confirm(`Удалить ${ids.length} запись(-ей) с planning.gov.kz? Это действие необратимо.`)) return
    setDeleting(true); setRecError(null); setMessage(null)
    try {
      const res = await deleteRecords(ids)
      setMessage(`Удалено: ${res.deleted_count}${res.failed_count ? `. Ошибок: ${res.failed_count}` : ''}`)
      setSelected(new Set())
      await loadRecords()
    } catch (e: any) { setRecError(e.message) }
    finally { setDeleting(false) }
  }

  // Stats
  const total       = records.length
  const ok          = records.filter(r => r.status === 'success').length
  const rate        = total > 0 ? Math.round((ok / total) * 100) : 0
  const lastImport  = records.length > 0 ? timeAgo(records[0].created_at) : '—'

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>История импортов</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>Импортированные документы и журнал действий</p>
        </div>
        <button
          onClick={loadRecords}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface-hover)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Обновить
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          accent="rgba(55,114,255,0.15)"
          label="Всего записей"
          value={total}
          icon={<svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
        />
        <StatCard
          accent="rgba(16,185,129,0.15)"
          label="Успешно"
          value={ok}
          icon={<svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
        <StatCard
          accent="rgba(99,102,241,0.15)"
          label="Процент успеха"
          value={`${rate}%`}
          icon={<svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
        />
        <StatCard
          accent="rgba(14,165,233,0.15)"
          label="Последний импорт"
          value={lastImport}
          icon={<svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
        />
      </div>

      {/* ── Notifications ── */}
      {recError && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm border border-red-500/20"
             style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--badge-err-fg)' }}>
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
          {recError}
        </div>
      )}
      {message && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm border border-emerald-500/20"
             style={{ background: 'rgba(16,185,129,0.08)', color: 'var(--badge-ok-fg)' }}>
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
          {message}
        </div>
      )}

      {/* ── Tabs + action row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {([['imports', 'История импорта', ok], ['audit', 'Журнал действий', null]] as [Tab, string, number | null][]).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="relative px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
              style={tab === key
                ? { background: 'var(--surface-hover)', color: 'var(--text-1)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }
                : { color: 'var(--text-3)' }}
            >
              {label}
              {count != null && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={tab === key
                        ? { background: 'rgba(55,114,255,0.2)', color: '#60a5fa' }
                        : { background: 'var(--border)', color: 'var(--text-4)' }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'imports' && successRecords.length > 0 && (
          <button
            onClick={() => handleDelete(successRecords.map(r => r.record_id!))}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all"
            style={{ borderColor: 'rgba(239,68,68,0.25)', color: 'var(--badge-err-fg)', background: 'rgba(239,68,68,0.06)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
            Удалить все
          </button>
        )}
      </div>

      {/* ── IMPORTS TABLE ── */}
      {tab === 'imports' && (
        <div className="card overflow-hidden">
          {loadingRecords ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-md)', borderTopColor: '#3772ff' }} />
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Загрузка...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="py-24 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(55,114,255,0.1)' }}>
                <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Нет импортированных записей</p>
              <p className="text-xs" style={{ color: 'var(--text-4)' }}>Импортируйте документы на вкладке «Импорт»</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                  <th className="px-5 py-3 w-10">
                    <input type="checkbox" checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded cursor-pointer accent-blue-500" />
                  </th>
                  {['ID', 'Документ', 'Организация', 'Данные', 'Статус', 'Дата', ''].map((h, i) => (
                    <th key={i} className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest ${i === 6 ? 'w-10' : ''}`}
                        style={{ color: 'var(--text-4)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const isSelected = r.record_id != null && selected.has(r.record_id)
                  const sm = STATUS_META[r.status]
                  return (
                    <tr
                      key={r.id}
                      onClick={() => r.record_id != null && toggleOne(r.record_id)}
                      className={`transition-colors ${r.record_id != null ? 'cursor-pointer' : ''}`}
                      style={{
                        borderBottom: '1px solid var(--divide)',
                        background: isSelected ? 'rgba(55,114,255,0.08)' : 'transparent',
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(55,114,255,0.08)' : 'transparent' }}
                    >
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        {r.record_id != null && (
                          <input type="checkbox" checked={isSelected} onChange={() => toggleOne(r.record_id!)}
                            className="w-4 h-4 rounded cursor-pointer accent-blue-500" />
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {r.record_id != null
                          ? <span className="font-mono text-[11px] font-bold px-2 py-1 rounded-md"
                                  style={{ background: 'rgba(55,114,255,0.15)', color: '#60a5fa' }}>
                              #{r.record_id}
                            </span>
                          : <span className="text-xs" style={{ color: sm?.color ?? 'var(--text-3)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{r.filename}</p>
                        {r.was_edited && (
                          <span className="text-[10px] font-semibold" style={{ color: 'var(--accent-violet-fg)' }}>✎ отредактировано</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 max-w-[180px]">
                        <span className="text-xs truncate block" style={{ color: 'var(--text-2)' }}>
                          {r.gu_name || r.gu_id || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[
                            { v: r.rights_count,            label: 'пр',  c: 'rgba(16,185,129,0.12)',  t: '#34d399' },
                            { v: r.responsibilities_count,  label: 'об',  c: 'rgba(251,191,36,0.12)',  t: '#fbbf24' },
                            { v: r.tasks_count,             label: 'зад', c: 'rgba(55,114,255,0.12)',  t: '#60a5fa' },
                            { v: r.functions_count,         label: 'фун', c: 'rgba(167,139,250,0.15)', t: '#a78bfa' },
                          ].map(({ v, label, c, t }) => (
                            <span key={label} className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                                  style={{ background: c, color: t }}>
                              {v} {label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {sm && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: sm.bg, color: sm.color }}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                            {sm.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-4)' }}>
                        {fmt(r.created_at)}
                      </td>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                             style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
                             onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(55,114,255,0.15)'; (e.currentTarget as HTMLElement).style.color = '#60a5fa'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(55,114,255,0.3)' }}
                             onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── AUDIT TAB ── */}
      {tab === 'audit' && (
        <div className="card overflow-hidden">
          {loadingAudit ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-md)', borderTopColor: '#3772ff' }} />
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Загрузка...</p>
            </div>
          ) : auditError ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--badge-err-fg)' }}>{auditError}</div>
          ) : auditEntries.length === 0 ? (
            <div className="py-24 flex flex-col items-center gap-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Журнал пуст</p>
              <p className="text-xs" style={{ color: 'var(--text-4)' }}>Действия начнут записываться автоматически</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-hover)' }}>
                  {['Действие', 'Документ', 'Организация', 'Статус', 'Время'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--text-4)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e) => {
                  const act = ACTION_META[e.action] ?? { label: e.action, color: 'text-white/50', dot: 'bg-white/30' }
                  const sm  = STATUS_META[e.status]
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--divide)' }}
                        onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                        onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = ''}>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${act.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${act.dot}`} />
                          {act.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 max-w-[240px]">
                        <span className="text-xs truncate block" style={{ color: 'var(--text-2)' }}>{e.filename || '—'}</span>
                      </td>
                      <td className="px-5 py-3 max-w-[180px]">
                        <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>{e.gu_name || e.gu_id || '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        {sm && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: sm.bg, color: sm.color }}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                            {sm.label}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-4)' }}>
                        {fmt(e.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Floating delete bar ── */}
      {tab === 'imports' && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 animate-modal">
          <div className="flex items-center gap-4 pl-5 pr-3 py-3 rounded-2xl"
               style={{
                 background: 'rgba(14,20,40,0.92)',
                 backdropFilter: 'blur(16px)',
                 border: '1px solid rgba(255,255,255,0.1)',
                 boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
               }}>
            <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
              Выбрано:{' '}
              <span className="font-bold text-blue-400">{selected.size}</span>
            </span>
            <div className="w-px h-5" style={{ background: 'var(--border-md)' }} />
            <button onClick={() => setSelected(new Set())}
                    className="text-sm transition-colors" style={{ color: 'var(--text-4)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'}>
              Отменить
            </button>
            <button
              onClick={() => handleDelete(Array.from(selected))}
              disabled={deleting}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
              style={{ background: 'rgba(239,68,68,0.9)', color: '#fff' }}
              onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,1)' }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.9)'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
              {deleting ? 'Удаление...' : `Удалить (${selected.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
