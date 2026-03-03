'use client'

import { useState, useEffect, useCallback } from 'react'
import { getRecords, getAuditLog, deleteRecords } from '@/lib/api'
import type { ImportedRecord, AuditLogEntry } from '@/lib/api'

type Tab = 'imports' | 'audit'

const ACTION_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  login:   { label: 'Вход',       color: '#6366f1', bg: '#eef2ff' },
  preview: { label: 'Просмотр',   color: '#0ea5e9', bg: '#e0f2fe' },
  import:  { label: 'Импорт',     color: '#059669', bg: '#ecfdf5' },
  delete:  { label: 'Удаление',   color: '#dc2626', bg: '#fef2f2' },
}

const STATUS_LABEL: Record<string, { color: string }> = {
  success: { color: '#059669' },
  skipped: { color: '#d97706' },
  error:   { color: '#dc2626' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function RecordsPage() {
  const [tab, setTab] = useState<Tab>('imports')

  // ── Import history state ──
  const [records, setRecords] = useState<ImportedRecord[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loadingRecords, setLoadingRecords] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // ── Audit log state ──
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true)
    setRecError(null)
    try {
      const res = await getRecords()
      setRecords(res.records)
    } catch (err: any) {
      setRecError(err.message)
    } finally {
      setLoadingRecords(false)
    }
  }, [])

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true)
    setAuditError(null)
    try {
      const res = await getAuditLog()
      setAuditEntries(res.entries)
    } catch (err: any) {
      setAuditError(err.message)
    } finally {
      setLoadingAudit(false)
    }
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])
  useEffect(() => { if (tab === 'audit' && auditEntries.length === 0) loadAudit() }, [tab, loadAudit, auditEntries.length])

  // ── Selection helpers ──
  const successRecords = records.filter(r => r.status === 'success' && r.record_id != null)
  const allSelected = successRecords.length > 0 && selected.size === successRecords.length
  const someSelected = selected.size > 0 && selected.size < successRecords.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(successRecords.map(r => r.record_id!)))
  const toggleOne = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleDelete = async (ids: number[]) => {
    if (!ids.length) return
    if (!confirm(`Удалить ${ids.length} запись(-ей) с planning.gov.kz? Это действие необратимо.`)) return
    setDeleting(true)
    setRecError(null)
    setMessage(null)
    try {
      const res = await deleteRecords(ids)
      setMessage(`Удалено: ${res.deleted_count}${res.failed_count ? `. Ошибок: ${res.failed_count}` : ''}`)
      setSelected(new Set())
      await loadRecords()
    } catch (err: any) {
      setRecError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">

      {/* Page header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-gov-navy">История</h1>
          <p className="text-sm text-gov-navy/50 mt-1">Импортированные документы и журнал действий</p>
        </div>
        {tab === 'imports' && successRecords.length > 0 && (
          <button
            onClick={() => handleDelete(successRecords.map(r => r.record_id!))}
            disabled={deleting}
            className="text-sm text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-4 py-2 rounded-lg transition-all font-medium disabled:opacity-40"
          >
            Удалить все
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-[#f0f2f7] p-1 rounded-xl w-fit">
        {([['imports', 'Импорты'], ['audit', 'Журнал действий']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === key
                ? 'bg-white text-gov-navy shadow-sm'
                : 'text-gov-navy/50 hover:text-gov-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Notifications */}
      {recError && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          {recError}
        </div>
      )}
      {message && (
        <div className="mb-5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {message}
        </div>
      )}

      {/* ── IMPORTS TAB ── */}
      {tab === 'imports' && (
        <div className="card overflow-hidden">
          {loadingRecords ? (
            <div className="py-20 text-center">
              <div className="inline-block w-6 h-6 border-2 border-gov-blue/30 border-t-gov-blue rounded-full animate-spin mb-3" />
              <p className="text-sm text-gov-navy/40">Загрузка...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gov-blue-light mx-auto mb-4 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-gov-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              </div>
              <p className="text-sm font-medium text-gov-navy/50">Нет импортированных записей</p>
              <p className="text-xs text-gov-navy/30 mt-1">Импортируйте документы на вкладке «Импорт»</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gov-grey-light bg-[#f8f9fc]">
                  <th className="px-5 py-3 text-left w-10">
                    <input type="checkbox" checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-gov-blue cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Документ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Организация</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Данные</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Дата</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gov-grey-light">
                {records.map((r, idx) => {
                  const isSelected = r.record_id != null && selected.has(r.record_id)
                  const statusColor = STATUS_LABEL[r.status]?.color ?? '#6b7280'
                  return (
                    <tr
                      key={r.id}
                      onClick={() => r.record_id != null && toggleOne(r.record_id)}
                      className={`transition-colors ${r.record_id != null ? 'cursor-pointer' : ''} ${
                        isSelected ? 'bg-gov-blue-light' :
                        idx % 2 === 0 ? 'bg-white hover:bg-[#f8f9fc]' : 'bg-[#fafafa] hover:bg-[#f5f6f9]'
                      }`}
                    >
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        {r.record_id != null && (
                          <input type="checkbox" checked={isSelected} onChange={() => toggleOne(r.record_id!)}
                            className="w-4 h-4 rounded accent-gov-blue cursor-pointer" />
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {r.record_id != null
                          ? <span className="font-mono text-xs bg-gov-blue-light text-gov-blue font-semibold px-2 py-0.5 rounded-md">{r.record_id}</span>
                          : <span className="text-xs" style={{ color: statusColor }}>{r.status === 'skipped' ? 'Пропущен' : 'Ошибка'}</span>}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <p className="text-xs font-medium text-gov-navy truncate">{r.filename}</p>
                        {r.was_edited && (
                          <span className="text-[10px] font-semibold text-indigo-500">✎ отредактировано</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gov-navy/70 text-xs max-w-[180px]">
                        <span className="truncate block">{r.gu_name || r.gu_id || '—'}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 text-[11px] font-medium text-gov-navy/60">
                          <span title="Права" className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{r.rights_count} пр</span>
                          <span title="Обязанности" className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{r.responsibilities_count} об</span>
                          <span title="Задачи" className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{r.tasks_count} зад</span>
                          <span title="Функции" className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{r.functions_count} фун</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-gov-navy/40 whitespace-nowrap">{fmt(r.created_at)}</td>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gov-blue hover:bg-gov-blue hover:text-white border border-gov-blue/20 hover:border-gov-blue transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
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

      {/* ── AUDIT LOG TAB ── */}
      {tab === 'audit' && (
        <div className="card overflow-hidden">
          {loadingAudit ? (
            <div className="py-20 text-center">
              <div className="inline-block w-6 h-6 border-2 border-gov-blue/30 border-t-gov-blue rounded-full animate-spin mb-3" />
              <p className="text-sm text-gov-navy/40">Загрузка...</p>
            </div>
          ) : auditError ? (
            <div className="py-12 text-center text-sm text-red-500">{auditError}</div>
          ) : auditEntries.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-sm font-medium text-gov-navy/50">Журнал пуст</p>
              <p className="text-xs text-gov-navy/30 mt-1">Действия начнут записываться автоматически</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gov-grey-light bg-[#f8f9fc]">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Действие</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Документ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Организация</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Статус</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Время</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gov-grey-light">
                {auditEntries.map((e, idx) => {
                  const act = ACTION_LABEL[e.action] ?? { label: e.action, color: '#6b7280', bg: '#f3f4f6' }
                  const st = STATUS_LABEL[e.status]
                  return (
                    <tr key={e.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                      <td className="px-5 py-3">
                        <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: act.color, backgroundColor: act.bg }}>
                          {act.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <span className="text-xs text-gov-navy/70 truncate block">{e.filename || '—'}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <span className="text-xs text-gov-navy/60 truncate block">{e.gu_name || e.gu_id || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {e.status && (
                          <span className="text-xs font-semibold" style={{ color: st?.color ?? '#6b7280' }}>
                            {e.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gov-navy/40 whitespace-nowrap">{fmt(e.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Delete selected floating bar */}
      {tab === 'imports' && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
          <div className="flex items-center gap-4 bg-gov-navy text-white pl-5 pr-3 py-3 rounded-2xl shadow-modal">
            <span className="text-sm font-medium">
              Выбрано: <span className="text-gov-blue-light font-bold">{selected.size}</span>
            </span>
            <div className="w-px h-5 bg-white/20" />
            <button onClick={() => setSelected(new Set())} className="text-sm text-white/50 hover:text-white transition-colors">
              Отменить
            </button>
            <button
              onClick={() => handleDelete(Array.from(selected))}
              disabled={deleting}
              className="text-sm bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              {deleting ? 'Удаление...' : `Удалить (${selected.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
