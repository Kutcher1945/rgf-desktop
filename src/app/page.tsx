'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  aiAnalyzeDocument, getOrganizations, importDocuments,
  importParsed, previewDocument, getRecords, getAuditLog,
} from '@/lib/api'
import type { Org, ImportResult, PreviewResult, PreviewData, ImportedRecord, AuditLogEntry } from '@/lib/api'
import PreviewModal from '@/components/PreviewModal'

interface SavedEdit {
  data: PreviewData
  guId: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин. назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч. назад`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} д. назад`
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'success') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
          style={{ background: 'var(--badge-ok-bg)', color: 'var(--badge-ok-fg)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--badge-ok-fg)' }} />OK
    </span>
  )
  if (status === 'skipped') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
          style={{ background: 'var(--badge-warn-bg)', color: 'var(--badge-warn-fg)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--badge-warn-fg)' }} />Пропущено
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
          style={{ background: 'var(--badge-err-bg)', color: 'var(--badge-err-fg)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--badge-err-fg)' }} />Ошибка
    </span>
  )
}

const ACTION_CONFIG: Record<string, { bg: string; fg: string; label: string }> = {
  login:   { bg: 'var(--badge-info-bg)',       fg: 'var(--badge-info-fg)',       label: 'Вход' },
  preview: { bg: 'var(--accent-violet-bg)',     fg: 'var(--accent-violet-fg)',    label: 'Просмотр' },
  import:  { bg: 'var(--badge-ok-bg)',          fg: 'var(--badge-ok-fg)',         label: 'Импорт' },
  delete:  { bg: 'var(--badge-err-bg)',         fg: 'var(--badge-err-fg)',        label: 'Удаление' },
}

function ActionBadge({ action }: { action: string }) {
  const c = ACTION_CONFIG[action] ?? { bg: 'var(--border-md)', fg: 'var(--text-3)', label: action }
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
          style={{ background: c.bg, color: c.fg }}>{c.label}</span>
  )
}

const PAGE_SIZE = 25

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t"
         style={{ borderColor: 'var(--border)', background: 'var(--surface-0)' }}>
      <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>{from}–{to} из {total}</span>
      <div className="flex items-center gap-0.5">
        <button disabled={page === 1} onClick={() => onChange(page - 1)}
          className="w-6 h-6 rounded flex items-center justify-center text-[13px] disabled:opacity-30 hover:bg-gov-blue/10 transition-colors"
          style={{ color: 'var(--text-3)' }}>‹</button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`el${i}`} className="w-6 text-center text-[10px]" style={{ color: 'var(--text-4)' }}>…</span>
          ) : (
            <button key={p} onClick={() => onChange(p as number)}
              className="w-6 h-6 rounded text-[10px] font-semibold transition-all hover:bg-gov-blue/10"
              style={page === p ? { background: '#3772ff', color: '#fff' } : { color: 'var(--text-3)' }}>
              {p}
            </button>
          )
        )}
        <button disabled={page === totalPages} onClick={() => onChange(page + 1)}
          className="w-6 h-6 rounded flex items-center justify-center text-[13px] disabled:opacity-30 hover:bg-gov-blue/10 transition-colors"
          style={{ color: 'var(--text-3)' }}>›</button>
      </div>
    </div>
  )
}

export default function ImportPage() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [savedEdits, setSavedEdits] = useState<Map<string, SavedEdit>>(new Map())
  const [previewCache, setPreviewCache] = useState<Map<string, PreviewResult>>(new Map())
  const [recentRecords, setRecentRecords] = useState<ImportedRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  // Tabs
  const [activeTab, setActiveTab] = useState<'history' | 'audit'>('history')
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [auditPage, setAuditPage] = useState(1)

  const autoPreviewing = useRef<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshRecords = useCallback(() => {
    getRecords()
      .then(res => { setRecentRecords(res.records); setHistoryPage(1) })
      .catch(() => {})
      .finally(() => setRecordsLoading(false))
  }, [])

  const fetchAuditLog = useCallback(() => {
    setAuditLoading(true)
    setAuditError(null)
    getAuditLog()
      .then(res => { setAuditLog(res.entries); setAuditPage(1) })
      .catch(err => setAuditError(err.message))
      .finally(() => setAuditLoading(false))
  }, [])

  const handleTabChange = (tab: 'history' | 'audit') => {
    setActiveTab(tab)
    if (tab === 'audit') fetchAuditLog()
  }

  useEffect(() => {
    getOrganizations()
      .then(setOrgs)
      .catch(() => setApiError('Не удалось подключиться к API. Проверьте соединение с exp-admin.smartalmaty.kz'))
    refreshRecords()
  }, [refreshRecords])

  useEffect(() => {
    files.forEach(file => {
      if (autoPreviewing.current.has(file.name)) return
      autoPreviewing.current.add(file.name)
      previewDocument(file)
        .then(result => setPreviewCache(prev => new Map(prev).set(file.name, result)))
        .catch(() => {})
        .finally(() => autoPreviewing.current.delete(file.name))
    })
  }, [files])

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    const docx = Array.from(newFiles).filter(f => f.name.endsWith('.docx'))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...docx.filter(f => !existing.has(f.name))]
    })
  }, [])

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name))

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handlePreview = async (file: File) => {
    setPreviewLoading(file.name)
    setPreviewError(null)
    try {
      const result = await previewDocument(file)
      setPreviewCache(prev => new Map(prev).set(file.name, result))
      setPreviewResult(result)
    } catch (err: any) {
      setPreviewError(`Ошибка предпросмотра: ${err.message}`)
    } finally {
      setPreviewLoading(null)
    }
  }

  const handleAiAnalyze = async (file: File) => {
    setAiLoading(file.name)
    setPreviewError(null)
    try {
      const result = await aiAnalyzeDocument(file)
      setPreviewCache(prev => new Map(prev).set(file.name, result))
      setPreviewResult(result)
    } catch (err: any) {
      setPreviewError(`Ошибка AI анализа: ${err.message}`)
    } finally {
      setAiLoading(null)
    }
  }

  const issueLabel = (issues: string[]) => {
    if (issues.includes('missing_rights_and_responsibilities')) return 'Нет прав и обяз.'
    if (issues.includes('missing_rights')) return 'Нет прав'
    if (issues.includes('missing_responsibilities')) return 'Нет обязанностей'
    return issues[0] ?? 'Ошибка'
  }

  const handleImport = async () => {
    if (!files.length) return
    setImporting(true)
    setImportError(null)
    setResults(null)
    try {
      const allResults: ImportResult[] = []
      const editedFiles = files.filter(f => savedEdits.has(f.name))
      const rawFiles = files.filter(f => !savedEdits.has(f.name))

      for (const f of editedFiles) {
        const { data, guId } = savedEdits.get(f.name)!
        const effectiveGuId = selectedOrgId || guId
        if (!effectiveGuId) {
          allResults.push({ filename: f.name, status: 'error', error: 'Организация не определена' })
          continue
        }
        try {
          const guName = previewCache.get(f.name)?.gu_name ?? ''
          const r = await importParsed(effectiveGuId, data, f.name, guName)
          allResults.push({ filename: f.name, ...r })
        } catch (err: any) {
          allResults.push({ filename: f.name, status: 'error', error: err.message })
        }
      }

      if (rawFiles.length) {
        const res = await importDocuments(rawFiles, selectedOrgId || undefined)
        allResults.push(...res.results)
      }

      setResults(allResults)
      setFiles([])
      setSavedEdits(new Map())
      setPreviewCache(new Map())
      autoPreviewing.current.clear()
      refreshRecords()
      // Refresh audit log if it was previously loaded
      if (activeTab === 'audit') fetchAuditLog()
    } catch (err: any) {
      setImportError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const successCount = results?.filter(r => r.status === 'success').length ?? 0
  const skippedCount = results?.filter(r => r.status === 'skipped').length ?? 0
  const errorCount   = results?.filter(r => r.status === 'error').length ?? 0

  const totalRec   = recentRecords.length
  const successRec = recentRecords.filter(r => r.status === 'success').length
  const lastImport = recentRecords[0]?.created_at
  const pagedRecords = recentRecords.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE)
  const pagedAudit   = auditLog.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE)

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ══════════════════════ LEFT PANEL ════════════════════════ */}
      <div className="w-[390px] shrink-0 border-r flex flex-col"
           style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Header */}
          <div className="pb-1">
            <h1 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>Импорт документов</h1>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>Загрузка положений на planning.gov.kz</p>
          </div>

          {/* API error */}
          {apiError && (
            <div className="px-3 py-2.5 rounded-lg text-xs flex items-start gap-2"
                 style={{ background: 'var(--badge-err-bg)', color: 'var(--badge-err-fg)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>{apiError}</span>
            </div>
          )}

          {/* Org selector */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>
              Организация
            </label>
            <div className="relative">
              <select
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="w-full appearance-none bg-[var(--surface-0)] border border-[var(--border-md)] hover:border-gov-blue/40 focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/10 rounded-lg px-3 py-2 text-[12px] text-[var(--text-2)] font-medium transition-all outline-none pr-7"
              >
                <option value="">— Определить автоматически по имени файла —</option>
                {orgs.map(org => (
                  <option key={org.id} value={String(org.id)}>{org.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]"
                    style={{ color: 'var(--text-4)' }}>▼</span>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl py-10 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-gov-blue bg-gov-blue/10 scale-[1.01]'
                : 'border-[var(--border-md)] bg-[var(--surface-0)] hover:border-gov-blue/50 hover:bg-gov-blue/[0.05]'
            }`}
          >
            <div className={`w-11 h-11 rounded-2xl mx-auto mb-2.5 flex items-center justify-center transition-colors ${
              isDragging ? 'bg-gov-blue text-white' : 'bg-gov-blue/20 text-gov-blue'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--text-2)' }}>Перетащите .docx файлы сюда</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>или кликните для выбора</p>
            <input ref={fileInputRef} type="file" accept=".docx" multiple className="hidden"
              onChange={e => addFiles(e.target.files)} />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-3.5 py-2 border-b flex items-center justify-between"
                   style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Файлы</span>
                <span className="text-[10px] font-semibold text-gov-blue bg-gov-blue/20 px-1.5 py-0.5 rounded-full">{files.length}</span>
              </div>
              <div className="divide-y divide-[var(--divide-md)]">
                {files.map(f => {
                  const isReviewed = savedEdits.has(f.name)
                  const cached = previewCache.get(f.name)
                  const hasError = !isReviewed && cached && cached.issues.length > 0
                  const hasWarning = !isReviewed && !hasError && cached && cached.warnings.length > 0
                  return (
                    <div key={f.name} className="px-3.5 py-3 transition-colors"
                         onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                         onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      {/* Row 1: icon + full name + status badge + remove */}
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-md bg-gov-blue/20 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-gov-blue text-[10px] font-bold">W</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium leading-snug break-all" style={{ color: 'var(--text-2)' }}>{f.name}</span>
                          {cached?.gu_name && (
                            <span className="text-[10px] block mt-0.5 leading-snug" style={{ color: 'var(--text-3)' }}>{cached.gu_name}</span>
                          )}
                        </div>
                        {isReviewed && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap"
                                style={{ background: 'var(--badge-ok-bg)', color: 'var(--badge-ok-fg)' }}>✓ Ок</span>
                        )}
                        {hasError && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap max-w-[90px] truncate"
                                style={{ background: 'var(--badge-err-bg)', color: 'var(--badge-err-fg)' }}>{issueLabel(cached!.issues)}</span>
                        )}
                        {hasWarning && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap"
                                style={{ background: 'var(--badge-warn-bg)', color: 'var(--badge-warn-fg)' }}>⚠</span>
                        )}
                        {!isReviewed && !cached && (
                          <span className="text-[10px] shrink-0 whitespace-nowrap" style={{ color: 'var(--text-4)' }}>···</span>
                        )}
                        <button
                          onClick={() => removeFile(f.name)}
                          className="w-5 h-5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-900/30 flex items-center justify-center transition-all shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                      {/* Row 2: action buttons */}
                      <div className="flex items-center gap-1.5 mt-2 ml-8">
                        <button
                          onClick={() => handlePreview(f)}
                          disabled={previewLoading === f.name || aiLoading === f.name}
                          className="flex items-center gap-1 text-[10px] text-gov-blue hover:text-gov-blue-hover font-medium border border-gov-blue/30 hover:border-gov-blue px-2 py-1 rounded-md transition-all disabled:opacity-40"
                        >
                          {previewLoading === f.name ? '...' : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              Просмотр
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleAiAnalyze(f)}
                          disabled={aiLoading === f.name || previewLoading === f.name}
                          title="AI анализ"
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-all disabled:opacity-40"
                          style={{ color: 'var(--accent-violet-fg)', background: 'var(--accent-violet-bg)', border: '1px solid var(--accent-violet-border)' }}
                        >
                          {aiLoading === f.name ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9.09 8.26 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-1.18-6.86L22 9.27l-7.09-1.01L12 2z"/></svg>
                          )}
                          AI
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Errors */}
          {previewError && (
            <div className="px-3 py-2.5 rounded-lg text-xs"
                 style={{ background: 'var(--badge-err-bg)', color: 'var(--badge-err-fg)', border: '1px solid rgba(239,68,68,0.3)' }}>{previewError}</div>
          )}
          {importError && (
            <div className="px-3 py-2.5 rounded-lg text-xs"
                 style={{ background: 'var(--badge-err-bg)', color: 'var(--badge-err-fg)', border: '1px solid rgba(239,68,68,0.3)' }}>{importError}</div>
          )}

          {/* Import results */}
          {results && (
            <div className="card overflow-hidden">
              <div className="px-3.5 py-2 border-b flex items-center gap-2"
                   style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Результат</span>
                <div className="flex gap-1.5 ml-auto">
                  {successCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'var(--badge-ok-bg)', color: 'var(--badge-ok-fg)' }}>✓ {successCount}</span>}
                  {skippedCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'var(--badge-warn-bg)', color: 'var(--badge-warn-fg)' }}>⚠ {skippedCount}</span>}
                  {errorCount > 0   && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'var(--badge-err-bg)', color: 'var(--badge-err-fg)' }}>✗ {errorCount}</span>}
                </div>
              </div>
              <div className="divide-y divide-[var(--divide-md)] max-h-48 overflow-y-auto">
                {results.map(r => (
                  <div key={r.filename} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                         style={{
                           background: r.status === 'success' ? 'var(--badge-ok-bg)'   : r.status === 'skipped' ? 'var(--badge-warn-bg)'   : 'var(--badge-err-bg)',
                           color:      r.status === 'success' ? 'var(--badge-ok-fg)'   : r.status === 'skipped' ? 'var(--badge-warn-fg)'   : 'var(--badge-err-fg)',
                         }}>
                      {r.status === 'success' && <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      {r.status === 'skipped' && <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                      {r.status === 'error'   && <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-2)' }}>{r.filename}</p>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                        {r.status === 'success' && <>ID: <span className="font-mono font-semibold text-gov-blue">{r.record_id}</span>{r.gu_name ? ` · ${r.gu_name}` : ''}</>}
                        {r.status === 'skipped' && r.skip_reason}
                        {r.status === 'error'   && r.error}
                      </p>
                    </div>
                    {r.status === 'success' && r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 text-gov-blue hover:text-gov-blue-hover border border-gov-blue/20 hover:border-gov-blue/50 rounded-md p-1 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky import button ─────────────────────────────── */}
        <div className="shrink-0 p-4 border-t" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <button
            onClick={handleImport}
            disabled={!files.length || importing}
            className="w-full py-2.5 bg-gov-blue hover:bg-gov-blue-hover active:bg-gov-blue-active disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-sm hover:shadow-md"
          >
            {importing
              ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Импортируем {files.length} файл(а)...
                </span>
              )
              : `Импортировать${files.length ? ` (${files.length})` : ''}`}
          </button>
        </div>
      </div>

      {/* ══════════════════════ RIGHT PANEL ═══════════════════════ */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── Stats bar ─────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-4 gap-3">
            {/* Total */}
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Всего записей</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{recordsLoading ? '—' : totalRec}</p>
            </div>
            {/* Success */}
            <div className="rounded-xl px-4 py-3"
                 style={{ background: 'var(--card-success-bg)', border: '1px solid var(--card-success-border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                 style={{ color: 'var(--card-success-label)' }}>Успешно</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--card-success-value)' }}>
                {recordsLoading ? '—' : successRec}
              </p>
            </div>
            {/* Success rate */}
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Процент успеха</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
                {recordsLoading || totalRec === 0 ? '—' : `${Math.round(successRec / totalRec * 100)}%`}
              </p>
            </div>
            {/* Last import */}
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Последний импорт</p>
              <p className="text-[13px] font-semibold leading-tight mt-1" style={{ color: 'var(--text-1)' }}>
                {recordsLoading ? '—' : lastImport ? timeAgo(lastImport) : 'Нет данных'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Tab bar ───────────────────────────────────────────── */}
        <div className="shrink-0 px-6 border-b flex items-center gap-0"
             style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          {([
            { id: 'history', label: 'История импорта' },
            { id: 'audit',   label: 'Журнал действий' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-3 text-[12px] font-semibold transition-all border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-gov-blue text-gov-blue'
                  : 'border-transparent hover:border-[var(--border)]'
              }`}
              style={activeTab !== tab.id ? { color: 'var(--text-3)' } : {}}
            >
              {tab.label}
              {tab.id === 'history' && !recordsLoading && (
                <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: activeTab === 'history' ? 'rgba(55,114,255,0.15)' : 'var(--surface-0)', color: activeTab === 'history' ? '#3772ff' : 'var(--text-4)' }}>
                  {totalRec}
                </span>
              )}
              {tab.id === 'audit' && !auditLoading && auditLog.length > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: activeTab === 'audit' ? 'rgba(55,114,255,0.15)' : 'var(--surface-0)', color: activeTab === 'audit' ? '#3772ff' : 'var(--text-4)' }}>
                  {auditLog.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Table area ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── History tab ─────────────────────────────────────── */}
          {activeTab === 'history' && (
            recordsLoading ? (
              <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-4)' }}>Загрузка...</div>
            ) : recentRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gov-blue/20 flex items-center justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gov-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Нет импортированных документов</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>Загрузите .docx файлы слева и нажмите «Импортировать»</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b" style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Организация</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>ID записи</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--text-3)' }}>Задачи</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--text-3)' }}>Функции</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--text-3)' }}>Права</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--text-3)' }}>Обяз.</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Статус</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Когда</th>
                      <th className="px-3 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecords.map((r, idx) => (
                      <tr
                        key={r.id}
                        className="transition-colors border-b"
                        style={{ background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)', borderColor: 'var(--divide)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)')}
                      >
                        <td className="px-4 py-2.5">
                          <p className="text-[11px] font-semibold truncate max-w-[220px]" style={{ color: 'var(--text-2)' }}>
                            {r.gu_name || r.gu_id || '—'}
                          </p>
                          <p className="text-[10px] truncate max-w-[220px] mt-0.5" style={{ color: 'var(--text-4)' }}>{r.filename}</p>
                          {r.was_edited && (
                            <span className="text-[9px] font-semibold px-1 py-0.5 rounded mt-0.5 inline-block"
                                  style={{ background: 'var(--accent-violet-bg)', color: 'var(--accent-violet-fg)', border: '1px solid var(--accent-violet-border)' }}>AI/edited</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.record_id != null ? (
                            <span className="font-mono text-[11px] font-semibold text-gov-blue bg-gov-blue/20 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                              #{r.record_id}
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: 'var(--text-5)' }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>{r.tasks_count ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[11px] font-semibold text-violet-500">{r.functions_count ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[11px] font-semibold text-emerald-500">{r.rights_count ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-[11px] font-semibold text-orange-500">{r.responsibilities_count ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-4)' }}>{timeAgo(r.created_at)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noopener noreferrer"
                              className="text-gov-blue/50 hover:text-gov-blue transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={historyPage} total={recentRecords.length} pageSize={PAGE_SIZE} onChange={setHistoryPage} />
              </div>
            )
          )}

          {/* ── Audit tab ────────────────────────────────────────── */}
          {activeTab === 'audit' && (
            auditLoading ? (
              <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-4)' }}>Загрузка...</div>
            ) : auditError ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--badge-err-fg)' }}>Ошибка загрузки журнала</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>{auditError}</p>
                <button
                  onClick={fetchAuditLog}
                  className="mt-3 text-[11px] font-medium text-gov-blue hover:text-gov-blue-hover border border-gov-blue/30 hover:border-gov-blue px-3 py-1.5 rounded-lg transition-all"
                >Повторить</button>
              </div>
            ) : auditLog.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gov-blue/20 flex items-center justify-center mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gov-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="11" y2="15"/></svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Журнал действий пуст</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>Здесь будут отображаться входы, просмотры и импорт</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b" style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Действие</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Файл / Организация</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Статус</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Время</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAudit.map((e, idx) => (
                      <tr
                        key={e.id}
                        className="transition-colors border-b"
                        style={{ background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)', borderColor: 'var(--divide)' }}
                        onMouseEnter={el => (el.currentTarget.style.background = 'var(--surface-hover)')}
                        onMouseLeave={el => (el.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)')}
                      >
                        <td className="px-4 py-2.5">
                          <ActionBadge action={e.action} />
                        </td>
                        <td className="px-3 py-2.5">
                          {e.filename ? (
                            <>
                              <p className="text-[11px] font-semibold truncate max-w-[280px]" style={{ color: 'var(--text-2)' }}>{e.filename}</p>
                              {e.gu_name && <p className="text-[10px] truncate max-w-[280px] mt-0.5" style={{ color: 'var(--text-4)' }}>{e.gu_name}</p>}
                            </>
                          ) : (
                            <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={e.status || 'success'} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-4)' }}>{timeAgo(e.created_at)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={auditPage} total={auditLog.length} pageSize={PAGE_SIZE} onChange={setAuditPage} />
              </div>
            )
          )}
        </div>
      </div>

      {previewResult && (
        <PreviewModal
          result={previewResult}
          guId={savedEdits.get(previewResult.filename)?.guId || selectedOrgId || previewResult.gu_id || undefined}
          orgs={orgs}
          savedData={savedEdits.get(previewResult.filename)?.data}
          onClose={() => setPreviewResult(null)}
          onSave={(data, guId) => {
            setSavedEdits(prev => new Map(prev).set(previewResult.filename, { data, guId: guId || selectedOrgId || previewResult.gu_id || '' }))
            setPreviewResult(null)
          }}
        />
      )}
    </div>
  )
}
