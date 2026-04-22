'use client'

import { useState, useRef, useCallback, useEffect, Fragment } from 'react'
import {
  aiAnalyzeDocument, getDepartments, getDeptUnits, getOrganizations, importDocuments,
  importParsed, saveDraft, submitDraft, previewDocument, getRecords, getAuditLog,
  uploadDepartmentExcel, getDepartmentExcelTemplateUrl, parseExcelFile,
  browseRecords, updateDraftStatus, updateDraftExcel, updateDraftData, getDicts,
  deleteDraft, restoreDraft, pingPlanning,
} from '@/lib/api'
import type { Department, Org, ImportResult, PreviewResult, PreviewData, ImportedRecord, AuditLogEntry, ExcelFunctionRow, PositionDepartmentItem, DraftStatus, Dicts, DictItem } from '@/lib/api'
import PreviewModal from '@/components/PreviewModal'
import { useUserRole } from '@/lib/user-context'

interface SavedEdit {
  data: PreviewData
  guId: string
  deptId?: string
  deptName?: string
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
  const userRole = useUserRole()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [savedEdits, setSavedEdits] = useState<Map<string, SavedEdit>>(new Map())
  const [previewCache, setPreviewCache] = useState<Map<string, PreviewResult>>(new Map())
  const [recentRecords, setRecentRecords] = useState<ImportedRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [expandedAdminWarnings, setExpandedAdminWarnings] = useState<Set<number>>(new Set())
  const toggleAdminWarning = (id: number) => setExpandedAdminWarnings(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  // Tabs
  const [activeTab, setActiveTab] = useState<'history' | 'audit' | 'registry'>('registry')
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [auditPage, setAuditPage] = useState(1)
  // Which draft record is currently open in the PreviewModal (for saving back)
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null)
  // Ref mirror — always current, safe to read inside async callbacks and closures
  const editingDraftIdRef = useRef<number | null>(null)
  // Inline staff count editor per draft row (id → value)
  const [draftStaffEdits, setDraftStaffEdits] = useState<Map<number, number>>(new Map())
  // Inline excel editor for drafts table
  const [expandedDraftId, setExpandedDraftId] = useState<number | null>(null)
  const [draftExcelEdits, setDraftExcelEdits] = useState<Map<number, ExcelFunctionRow[]>>(new Map())
  const [inlineDicts, setInlineDicts] = useState<Dicts | null>(null)
  const [savingExcel, setSavingExcel] = useState(false)
  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'warn' | 'err' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string, type: 'warn' | 'err' = 'warn') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }
  // Registry sub-tab
  const [adminRegSubTab, setAdminRegSubTab] = useState<'drafts' | 'registry'>('drafts')

  // ── Draft filters ──
  const [draftSearch, setDraftSearch]             = useState('')
  const [draftFilterStatus, setDraftFilterStatus] = useState<string>('all')
  const [draftFilterEdited, setDraftFilterEdited] = useState(false)
  const [showDeletedDrafts, setShowDeletedDrafts] = useState(false)
  const [deletedRecords, setDeletedRecords]       = useState<ImportedRecord[]>([])
  const [loadingDeleted, setLoadingDeleted]       = useState(false)
  const [submittingDraftId, setSubmittingDraftId] = useState<number | null>(null)
  const [regType, setRegType] = useState<1 | 4 | 5>(4)
  const [regItems, setRegItems] = useState<PositionDepartmentItem[]>([])
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)
  const [regSearch, setRegSearch] = useState('')
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; filename: string } | null>(null)

  const [orgSearch, setOrgSearch] = useState('')
  const [orgDropOpen, setOrgDropOpen] = useState(false)
  const orgDropRef = useRef<HTMLDivElement>(null)

  // Level selector: Департамент vs Управление vs Отдел
  const [levelType, setLevelType] = useState<'dept' | 'gu' | 'otdel'>('gu')
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState('')
  const [deptsLoading, setDeptsLoading] = useState(false)
  // When opening a draft for edit, store the dept name so the useEffect can resolve it to planning_id after loading
  const pendingDeptNameRef = useRef<string>('')
  const [deptDropOpen, setDeptDropOpen] = useState(false)
  const [deptSearch, setDeptSearch] = useState('')
  const deptDropRef = useRef<HTMLDivElement>(null)
  const [excelUploading, setExcelUploading] = useState(false)

  // ── Draft level changer ──
  const [changingLevelDraftId, setChangingLevelDraftId] = useState<number | null>(null)

  // ── Per-file GU/dept inline editor ──
  const [fileEditingOrg, setFileEditingOrg]         = useState<string | null>(null)
  const [fileEditOrgId, setFileEditOrgId]           = useState('')
  const [fileEditOrgSearch, setFileEditOrgSearch]   = useState('')
  const [fileEditDepts, setFileEditDepts]           = useState<Department[]>([])
  const [fileEditDeptId, setFileEditDeptId]         = useState('')
  const [fileEditDeptSearch, setFileEditDeptSearch] = useState('')
  const [fileEditDeptsLoading, setFileEditDeptsLoading] = useState(false)
  const [excelUploadResult, setExcelUploadResult] = useState<{ rows: number } | null>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)

  // Pending xlsx files attached per docx filename (uploaded to server just before import)
  const [pendingExcels, setPendingExcels] = useState<Map<string, File>>(new Map())
  // Parsed rows from attached xlsx — for collapse/expand in PreviewModal
  const [excelRows, setExcelRows] = useState<Map<string, ExcelFunctionRow[]>>(new Map())
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const xlsxTargetRef = useRef<string | null>(null)   // which docx the picker is for

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

  const fetchRegistry = useCallback((type: 1 | 4 | 5) => {
    setRegLoading(true); setRegError(null)
    browseRecords(type)
      .then(r => setRegItems(r.content ?? []))
      .catch(e => setRegError(e.message))
      .finally(() => setRegLoading(false))
  }, [])

  const handleTabChange = (tab: 'history' | 'audit' | 'registry') => {
    setActiveTab(tab)
    if (tab === 'audit') fetchAuditLog()
    if (tab === 'registry') fetchRegistry(regType)
  }

  useEffect(() => {
    getOrganizations()
      .then(setOrgs)
      .catch(() => setApiError('Не удалось подключиться к API. Проверьте, что бэкенд запущен на localhost:8000'))
    refreshRecords()
    fetchRegistry(4)
  }, [refreshRecords, fetchRegistry])

  useEffect(() => {
    if (!orgDropOpen) return
    const handler = (e: MouseEvent) => {
      if (orgDropRef.current && !orgDropRef.current.contains(e.target as Node)) {
        setOrgDropOpen(false)
        setOrgSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [orgDropOpen])

  useEffect(() => {
    if (!deptDropOpen) return
    const handler = (e: MouseEvent) => {
      if (deptDropRef.current && !deptDropRef.current.contains(e.target as Node)) {
        setDeptDropOpen(false)
        setDeptSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [deptDropOpen])

  // Poll planning.gov.kz session validity every 60s — detect when another user logs in
  useEffect(() => {
    const check = async () => {
      const result = await pingPlanning()
      setSessionChecked(true)
      setSessionExpired(!result.ok && result.reason === 'session_expired')
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])

  // Fetch departments whenever org selection / level type changes
  useEffect(() => {
    if (levelType === 'dept') {
      // Département (type=1): dept list from dict-org-struct/department, no guId needed
      setDeptsLoading(true)
      setSelectedDeptId('')
      getDeptUnits()
        .then(depts => {
          setDepartments(depts)
          if (pendingDeptNameRef.current) {
            const name = pendingDeptNameRef.current
            pendingDeptNameRef.current = ''
            const found = depts.find(d => d.name === name)
              || depts.find(d => d.name.toLowerCase().includes(name.toLowerCase().slice(0, 30)))
            if (found) setSelectedDeptId(String(found.id))
          }
        })
        .catch(() => setDepartments([]))
        .finally(() => setDeptsLoading(false))
      return
    }
    if (levelType !== 'otdel' || !selectedOrgId) {
      setDepartments([])
      setSelectedDeptId('')
      return
    }
    setDeptsLoading(true)
    setSelectedDeptId('')
    getDepartments(selectedOrgId)
      .then(depts => {
        setDepartments(depts)
        if (pendingDeptNameRef.current) {
          const name = pendingDeptNameRef.current
          pendingDeptNameRef.current = ''
          const found = depts.find(d => d.name === name)
            || depts.find(d => d.name.toLowerCase().includes(name.toLowerCase().slice(0, 30)))
          if (found) setSelectedDeptId(String(found.id))
        }
      })
      .catch(() => setDepartments([]))
      .finally(() => setDeptsLoading(false))
  }, [levelType, selectedOrgId])

  useEffect(() => {
    files.forEach(file => {
      if (autoPreviewing.current.has(file.name)) return
      autoPreviewing.current.add(file.name)
      previewDocument(file)
        .then(result => {
          setPreviewCache(prev => new Map(prev).set(file.name, result))
          applyAutoDetect(result)
        })
        .catch(() => {})
        .finally(() => autoPreviewing.current.delete(file.name))
    })
  }, [files])

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    const docx = Array.from(newFiles).filter(f => f.name.toLowerCase().endsWith('.docx'))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...docx.filter(f => !existing.has(f.name))]
    })
  }, [])

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name))
    setPendingExcels(prev => { const next = new Map(prev); next.delete(name); return next })
    setExcelRows(prev => { const next = new Map(prev); next.delete(name); return next })
  }

  const openFileOrgEdit = (filename: string) => {
    const edit    = savedEdits.get(filename)
    const cached  = previewCache.get(filename)
    const orgId   = edit?.guId   || cached?.gu_id  || selectedOrgId  || ''
    const deptId  = edit?.deptId || cached?.suggested_dept_id?.toString() || selectedDeptId || ''
    setFileEditOrgId(orgId)
    setFileEditDeptId(deptId)
    setFileEditOrgSearch('')
    setFileEditDeptSearch('')
    setFileEditDepts([])
    setFileEditingOrg(filename)
    if (orgId) {
      setFileEditDeptsLoading(true)
      getDepartments(orgId)
        .then(setFileEditDepts)
        .catch(() => setFileEditDepts([]))
        .finally(() => setFileEditDeptsLoading(false))
    }
  }

  const saveFileOrgEdit = (filename: string) => {
    const cached      = previewCache.get(filename)
    const existingEdit = savedEdits.get(filename)
    const selectedDept = fileEditDepts.find(d => String(d.id) === fileEditDeptId)
    const emptyData    = { general_provisions: '', tasks: [], authorities_rights: [], authorities_responsibilities: [], functions: [], additions: '' }
    const data         = existingEdit?.data || cached?.data || emptyData
    setSavedEdits(prev => {
      const next = new Map(prev)
      next.set(filename, {
        ...(existingEdit ?? {}),
        data,
        guId:     fileEditOrgId,
        deptId:   fileEditDeptId || undefined,
        deptName: selectedDept?.name || existingEdit?.deptName || '',
      })
      return next
    })
    setFileEditingOrg(null)
  }

  const handleAttachExcel = async (docxName: string, xlsxFile: File) => {
    setPendingExcels(prev => new Map(prev).set(docxName, xlsxFile))
    try {
      const rows = await parseExcelFile(xlsxFile)
      setExcelRows(prev => new Map(prev).set(docxName, rows))
    } catch {}
  }

  const autoLinkXlsx = (allFiles: FileList | File[]) => {
    const arr = Array.from(allFiles)
    const docxFiles = arr.filter(f => f.name.toLowerCase().endsWith('.docx'))
    const xlsxFiles = arr.filter(f => f.name.toLowerCase().endsWith('.xlsx'))
    if (!xlsxFiles.length || !docxFiles.length) return
    xlsxFiles.forEach(xlsxFile => {
      let target: File | undefined
      if (docxFiles.length === 1) {
        target = docxFiles[0]
      } else {
        const xlsxBase = xlsxFile.name.toLowerCase().replace(/\.[^.]+$/, '')
        target = docxFiles.find(d => {
          const docxBase = d.name.toLowerCase().replace(/\.[^.]+$/, '')
          return docxBase.includes(xlsxBase.slice(0, 8)) || xlsxBase.includes(docxBase.slice(0, 8))
        }) ?? docxFiles[0]
      }
      if (target) handleAttachExcel(target.name, xlsxFile)
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
    autoLinkXlsx(e.dataTransfer.files)
  }, [addFiles])

  const applyAutoDetect = (result: PreviewResult) => {
    // Auto-set parent Управление if not already chosen
    if (result.gu_id && !selectedOrgId) {
      setSelectedOrgId(result.gu_id)
    }
    // If the backend detected an Отдел, switch to otdel mode and select it
    if (result.suggested_dept_id) {
      if (levelType !== 'otdel') setLevelType('otdel')
      setSelectedDeptId(result.suggested_dept_id)
    }
    // In Департамент mode, auto-select the matched dept unit
    if (levelType === 'dept' && result.suggested_dept_unit_id) {
      setSelectedDeptId(String(result.suggested_dept_unit_id))
    }
  }

  const handlePreview = async (file: File) => {
    setPreviewLoading(file.name)
    setPreviewError(null)
    try {
      const result = await previewDocument(file)
      setPreviewCache(prev => new Map(prev).set(file.name, result))
      applyAutoDetect(result)
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
      applyAutoDetect(result)
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

  const handleExcelUpload = async (file: File) => {
    if (!selectedDeptId) return
    setExcelUploading(true)
    setExcelUploadResult(null)
    try {
      const res = await uploadDepartmentExcel(Number(selectedDeptId), file)
      setExcelUploadResult({ rows: res.rows_loaded })
    } catch {
      setExcelUploadResult(null)
    } finally {
      setExcelUploading(false)
    }
  }

  const handleImport = async () => {
    if (!files.length) return
    setImporting(true)
    setImportError(null)
    setResults(null)

    const editedFiles = files.filter(f => savedEdits.has(f.name))
    const rawFiles = files.filter(f => !savedEdits.has(f.name))
    const total = editedFiles.length + rawFiles.length
    const allResults: ImportResult[] = []
    let current = 0
    const docType = levelType === 'dept' ? 1 : levelType === 'gu' ? 4 : 5

    setImportProgress({ current: 0, total, filename: '' })

    try {
      for (const f of editedFiles) {
        current++
        setImportProgress({ current, total, filename: f.name })
        const { data, guId, deptId: savedDeptId } = savedEdits.get(f.name)!
        const effectiveGuId = selectedOrgId || guId
        const cached0 = previewCache.get(f.name)
        const effectiveDeptId = savedDeptId
          || cached0?.suggested_dept_unit_id?.toString()
          || cached0?.suggested_dept_id
          || (levelType === 'otdel' || levelType === 'dept' ? selectedDeptId : '')
        const deptId = effectiveDeptId ? Number(effectiveDeptId) : undefined
        // Upload pending xlsx if attached and dept is known
        const pendingXlsx = pendingExcels.get(f.name)
        if (pendingXlsx && deptId) {
          try { await uploadDepartmentExcel(deptId, pendingXlsx) } catch {}
        }
        if (!effectiveGuId) {
          allResults.push({ filename: f.name, status: 'error', error: 'Организация не определена' })
        } else {
          try {
            const guName = cached0?.gu_name ?? ''
            const existingPid = cached0?.existing_position_record_id
            const parentPid = cached0?.parent_position_record_id
            const r = await importParsed(effectiveGuId, data, f.name, guName, deptId, existingPid, parentPid, excelRows.get(f.name), docType as 3 | 4 | 5)
            allResults.push({ filename: f.name, ...r })
          } catch (err: any) {
            allResults.push({ filename: f.name, status: 'error', error: err.message })
          }
        }
        setResults([...allResults])
      }

      for (const f of rawFiles) {
        current++
        setImportProgress({ current, total, filename: f.name })
        const cached = previewCache.get(f.name)
        const effectiveDeptId = cached?.suggested_dept_unit_id?.toString()
          || cached?.suggested_dept_id
          || (levelType === 'otdel' || levelType === 'dept' ? selectedDeptId : '')
        const deptId = effectiveDeptId ? Number(effectiveDeptId) : undefined
        // Upload pending xlsx if attached and dept is known
        const pendingXlsx = pendingExcels.get(f.name)
        if (pendingXlsx && deptId) {
          try { await uploadDepartmentExcel(deptId, pendingXlsx) } catch {}
        }
        // If preview cache exists, use importParsed so parent_position_record_id is passed correctly.
        // dept mode (type=1) has no GU — pass empty string, backend handles it.
        if (cached?.data && (cached.gu_id || selectedOrgId || levelType === 'dept')) {
          const effectiveGuId = selectedOrgId || cached.gu_id || ''
          const guName = cached.gu_name ?? ''
          const parentPid = cached.parent_position_record_id
          const existingPid = cached.existing_position_record_id
          try {
            const r = await importParsed(effectiveGuId, cached.data, f.name, guName, deptId, existingPid, parentPid, excelRows.get(f.name), docType as 3 | 4 | 5)
            allResults.push({ filename: f.name, ...r })
          } catch (err: any) {
            allResults.push({ filename: f.name, status: 'error', error: err.message })
          }
        } else {
          try {
            const res = await importDocuments([f], selectedOrgId || undefined, deptId)
            allResults.push(...res.results)
          } catch (err: any) {
            allResults.push({ filename: f.name, status: 'error', error: err.message })
          }
        }
        setResults([...allResults])
      }

      setFiles([])
      setSavedEdits(new Map())
      setPreviewCache(new Map())
      autoPreviewing.current.clear()
      refreshRecords()
      if (activeTab === 'audit') fetchAuditLog()
    } catch (err: any) {
      setImportError(err.message)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleSaveDraft = async () => {
    if (!files.length) return
    setImporting(true)
    setImportError(null)
    setResults(null)
    const allResults: ImportResult[] = []
    try {
      for (const f of files) {
        const edit = savedEdits.get(f.name)
        const preview = previewCache.get(f.name)
        const guId = selectedOrgId || edit?.guId || preview?.gu_id || ''
        const guName = (edit?.guId ? orgs.find(o => String(o.id) === edit.guId)?.name : undefined)
          || preview?.gu_name || ''
        if (!guId && levelType !== 'dept') {
          allResults.push({ filename: f.name, status: 'error', error: 'Организация не определена' })
          continue
        }
        const data = edit?.data ?? preview?.data
        if (!data) {
          allResults.push({ filename: f.name, status: 'skipped', skip_reason: 'Нет данных для черновика (сначала нажмите Просмотр)' })
          continue
        }
        try {
          // If operator explicitly reviewed/edited the file (savedEdits entry exists),
          // respect their exact choice for dept. Only fall back to auto-detected
          // suggested_dept_id when no review has been done at all.
          const deptIdRaw  = edit !== undefined ? edit.deptId : (preview?.suggested_dept_unit_id?.toString() || preview?.suggested_dept_id)
          const deptIdNum  = deptIdRaw ? Number(deptIdRaw) : undefined
          const deptNameStr = edit !== undefined
            ? (edit.deptName || (deptIdRaw ? (preview?.suggested_dept_unit_name ?? preview?.suggested_dept_name ?? '') : ''))
            : (preview?.suggested_dept_unit_name ?? preview?.suggested_dept_name ?? '')
          const saveDocType = levelType === 'dept' ? 1 : levelType === 'gu' ? 4 : 5
          await saveDraft(guId, data, f.name, guName, excelRows.get(f.name), deptIdNum, deptNameStr,
            preview?.stats?.confidence, preview?.warnings, saveDocType)
          allResults.push({ filename: f.name, status: 'success' })
        } catch (err: any) {
          allResults.push({ filename: f.name, status: 'error', error: err.message })
        }
      }
      setResults(allResults)
      setFiles([])
      setSavedEdits(new Map())
      setPreviewCache(new Map())
      autoPreviewing.current.clear()
      refreshRecords()
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

  // ── Inline excel editor helpers ───────────────────────────────────────────
  const REQUIRED_META: { key: keyof ExcelFunctionRow; label: string; type: 'text' | 'textarea' | 'select' | 'bool' }[] = [
    { key: 'function_name_kz',         label: 'Название (каз.)',        type: 'textarea' },
    { key: 'function_type',            label: 'Тип функции',            type: 'select'   },
    { key: 'task_name',                label: 'Задача',                 type: 'text'     },
    { key: 'activity_area_name',       label: 'Сфера деятельности',     type: 'select'   },
    { key: 'sub_activity_area_name',   label: 'Подсфера',               type: 'select'   },
    { key: 'functional_group_name',    label: 'Функц. группа (ЕБК)',    type: 'select'   },
    { key: 'functional_subgroup_name', label: 'Функц. подгруппа (ЕБК)', type: 'select'   },
    { key: 'structural_element',       label: 'Структурный элемент',    type: 'text'     },
    { key: 'law_ru',                   label: 'Законодательство',       type: 'text'     },
    { key: 'digital_maturity',         label: 'Цифровая зрелость',      type: 'select'   },
  ]
  const isMissingField = (row: ExcelFunctionRow, key: keyof ExcelFunctionRow) => {
    const v = row[key]
    if (typeof v === 'boolean') return false
    return !String(v ?? '').trim()
  }
  const getMissingKeys = (row: ExcelFunctionRow) =>
    REQUIRED_META.filter(f => isMissingField(row, f.key))
  const getIncompleteRows = (rows: ExcelFunctionRow[]) =>
    rows.map((row, i) => ({ row, i, missing: getMissingKeys(row) })).filter(x => x.missing.length > 0)

  const openDraftInlineEditor = async (draftId: number, rows: ExcelFunctionRow[]) => {
    if (expandedDraftId === draftId) { setExpandedDraftId(null); return }
    // Clone rows into edit state
    setDraftExcelEdits(prev => new Map(prev).set(draftId, rows.map(r => ({ ...r }))))
    setExpandedDraftId(draftId)
    if (!inlineDicts) getDicts().then(setInlineDicts).catch(() => {})
  }

  const updateInlineField = (draftId: number, rowIdx: number, key: keyof ExcelFunctionRow, value: string | boolean | number | undefined) => {
    setDraftExcelEdits(prev => {
      const rows = [...(prev.get(draftId) ?? [])]
      rows[rowIdx] = { ...rows[rowIdx], [key]: value }
      return new Map(prev).set(draftId, rows)
    })
  }

  const saveInlineExcel = async (draftId: number) => {
    const rows = draftExcelEdits.get(draftId)
    if (!rows) return
    setSavingExcel(true)
    try {
      await updateDraftExcel(draftId, rows)
      setRecentRecords(prev => prev.map(r => r.id === draftId
        ? { ...r, excel_rows: rows, has_function_meta: rows.length > 0 }
        : r))
      setExpandedDraftId(null)
    } catch {}
    finally { setSavingExcel(false) }
  }

  const getDictItems = (key: keyof ExcelFunctionRow, currentRow: ExcelFunctionRow): DictItem[] => {
    if (!inlineDicts) return []
    if (key === 'function_type')            return inlineDicts.function_types
    if (key === 'activity_area_name')       return inlineDicts.activity_areas
    if (key === 'sub_activity_area_name')   return currentRow.activity_area_id
      ? inlineDicts.sub_activity_areas.filter(x => x.area_id === currentRow.activity_area_id)
      : inlineDicts.sub_activity_areas
    if (key === 'functional_group_name')    return inlineDicts.functional_groups
    if (key === 'functional_subgroup_name') return currentRow.functional_group_id
      ? inlineDicts.functional_subgroups.filter(x => x.group_id === currentRow.functional_group_id)
      : inlineDicts.functional_subgroups
    if (key === 'digital_maturity')         return inlineDicts.digital_maturities
    return []
  }

  const getIdKey = (key: keyof ExcelFunctionRow): keyof ExcelFunctionRow | null => {
    const map: Partial<Record<keyof ExcelFunctionRow, keyof ExcelFunctionRow>> = {
      function_type:            'function_type_id',
      activity_area_name:       'activity_area_id',
      sub_activity_area_name:   'sub_activity_area_id',
      functional_group_name:    'functional_group_id',
      functional_subgroup_name: 'functional_subgroup_id',
      digital_maturity:         'digital_maturity_id',
    }
    return map[key] ?? null
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Session status banner (always visible after first check) ── */}
      {sessionChecked && (
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-1.5"
             style={sessionExpired
               ? { background: 'rgba(239,68,68,0.10)', borderBottom: '1px solid rgba(239,68,68,0.3)' }
               : { background: 'rgba(16,185,129,0.07)', borderBottom: '1px solid rgba(16,185,129,0.2)' }}>
          {/* Dot indicator */}
          <span className="w-2 h-2 rounded-full shrink-0"
                style={{ background: sessionExpired ? '#f87171' : '#34d399',
                         boxShadow: sessionExpired ? '0 0 6px rgba(239,68,68,0.6)' : '0 0 6px rgba(52,211,153,0.6)' }} />
          <span className="text-[11px] font-medium"
                style={{ color: sessionExpired ? '#fca5a5' : '#6ee7b7' }}>
            {sessionExpired
              ? 'Сессия planning.gov.kz завершена — возможно, выполнен вход с другого устройства. Импорт недоступен.'
              : 'Сессия planning.gov.kz активна'}
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

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

          {/* Level type toggle */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>
              Уровень
            </label>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-md)', background: 'var(--surface-0)' }}>
              {(['dept', 'gu', 'otdel'] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => { setLevelType(level); setSelectedDeptId('') }}
                  className="flex-1 py-1.5 text-[12px] font-medium transition-all duration-150"
                  style={levelType === level ? {
                    background: 'linear-gradient(135deg, rgba(55,114,255,0.22), rgba(99,102,241,0.15))',
                    color: '#93b4ff',
                    borderBottom: '2px solid #3772ff',
                  } : {
                    color: 'var(--text-3)',
                    borderBottom: '2px solid transparent',
                  }}
                >
                  {level === 'dept' ? 'Департамент' : level === 'gu' ? 'Управление' : 'Отдел'}
                </button>
              ))}
            </div>
          </div>

          {/* Org selector — hidden in Департамент mode (guId auto-detected from document) */}
          {levelType !== 'dept' && <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>
              {levelType === 'otdel' ? 'Управление (родитель)' : 'Организация'}
            </label>
            <div className="relative" ref={orgDropRef}>
              {/* Trigger button */}
              <button
                type="button"
                onClick={() => { setOrgDropOpen(v => !v); setOrgSearch('') }}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-[12px] font-medium transition-all outline-none border"
                style={{
                  background: 'var(--surface-0)',
                  borderColor: orgDropOpen ? '#3772ff' : 'var(--border-md)',
                  color: selectedOrgId ? 'var(--text-2)' : 'var(--text-4)',
                  boxShadow: orgDropOpen ? '0 0 0 2px rgba(55,114,255,0.12)' : 'none',
                }}
              >
                <span className="truncate text-left">
                  {selectedOrgId
                    ? (orgs.find(o => String(o.id) === selectedOrgId)?.name ?? '—')
                    : '— Определить автоматически по имени файла —'}
                </span>
                <svg className="w-3.5 h-3.5 shrink-0 ml-2 transition-transform" style={{ color: 'var(--text-4)', transform: orgDropOpen ? 'rotate(180deg)' : 'none' }}
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown panel */}
              {orgDropOpen && (
                <div
                  className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-md)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                  }}
                >
                  {/* Search input */}
                  <div className="p-2 border-b" style={{ borderColor: 'var(--divide)' }}>
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                           style={{ color: 'var(--text-4)' }}
                           fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
                      </svg>
                      <input
                        autoFocus
                        type="text"
                        value={orgSearch}
                        onChange={e => setOrgSearch(e.target.value)}
                        placeholder="Поиск организации..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[12px] outline-none border"
                        style={{
                          background: 'var(--surface-0)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-1)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Options list */}
                  <div className="max-h-56 overflow-y-auto py-1">
                    {/* Auto option */}
                    {(orgSearch === '' || '— определить автоматически по имени файла —'.includes(orgSearch.toLowerCase())) && (
                      <button
                        type="button"
                        onClick={() => { setSelectedOrgId(''); setOrgDropOpen(false); setOrgSearch('') }}
                        className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                        style={{
                          color: selectedOrgId === '' ? '#3772ff' : 'var(--text-3)',
                          background: selectedOrgId === '' ? 'rgba(55,114,255,0.08)' : 'transparent',
                          fontStyle: 'italic',
                        }}
                        onMouseEnter={e => { if (selectedOrgId !== '') (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                        onMouseLeave={e => { if (selectedOrgId !== '') (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        — Определить автоматически по имени файла —
                      </button>
                    )}
                    {orgs
                      .filter(o => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
                      .map(org => (
                        <button
                          key={org.id}
                          type="button"
                          onClick={() => { setSelectedOrgId(String(org.id)); setOrgDropOpen(false); setOrgSearch('') }}
                          className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                          style={{
                            color: String(org.id) === selectedOrgId ? '#3772ff' : 'var(--text-2)',
                            background: String(org.id) === selectedOrgId ? 'rgba(55,114,255,0.08)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (String(org.id) !== selectedOrgId) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                          onMouseLeave={e => { if (String(org.id) !== selectedOrgId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          {org.name}
                        </button>
                      ))}
                    {orgs.filter(o => o.name.toLowerCase().includes(orgSearch.toLowerCase())).length === 0 && orgSearch !== '' && (
                      <p className="px-3 py-3 text-[11px] text-center" style={{ color: 'var(--text-4)' }}>
                        Ничего не найдено
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>}

          {/* Department selector (Отдел and Департамент modes) */}
          {(levelType === 'otdel' || levelType === 'dept') && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>
                {levelType === 'dept' ? 'Департаменты' : 'Отдел'}
              </label>
              {!selectedOrgId && levelType !== 'dept' ? (
                <div className="px-3 py-2 rounded-lg text-[11px]" style={{ color: 'var(--text-4)', background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
                  Сначала выберите Управление
                </div>
              ) : deptsLoading ? (
                <div className="px-3 py-2 rounded-lg text-[11px] flex items-center gap-2" style={{ color: 'var(--text-4)', background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
                  <span className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--text-4)', borderTopColor: 'transparent' }} />
                  Загрузка отделов...
                </div>
              ) : (
                <div className="relative" ref={deptDropRef}>
                  <button
                    type="button"
                    onClick={() => { setDeptDropOpen(v => !v); setDeptSearch('') }}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-[12px] font-medium transition-all outline-none border"
                    style={{
                      background: 'var(--surface-0)',
                      borderColor: deptDropOpen ? '#3772ff' : 'var(--border-md)',
                      color: selectedDeptId ? 'var(--text-2)' : 'var(--text-4)',
                      boxShadow: deptDropOpen ? '0 0 0 2px rgba(55,114,255,0.12)' : 'none',
                    }}
                  >
                    <span className="truncate text-left">
                      {selectedDeptId
                        ? (departments.find(d => String(d.id) === selectedDeptId)?.name ?? '—')
                        : levelType === 'dept' ? '— Определить автоматически —' : '— Выберите отдел —'}
                    </span>
                    <svg className="w-3.5 h-3.5 shrink-0 ml-2 transition-transform" style={{ color: 'var(--text-4)', transform: deptDropOpen ? 'rotate(180deg)' : 'none' }}
                         fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {deptDropOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden"
                         style={{ background: 'var(--surface-1)', border: '1px solid var(--border-md)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
                      <div className="p-2 border-b" style={{ borderColor: 'var(--divide)' }}>
                        <div className="relative">
                          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-4)' }}
                               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
                          </svg>
                          <input autoFocus type="text" value={deptSearch} onChange={e => setDeptSearch(e.target.value)}
                                 placeholder="Поиск отдела..."
                                 className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[12px] outline-none border"
                                 style={{ background: 'var(--surface-0)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {(deptSearch === '' || '— определить автоматически —'.includes(deptSearch.toLowerCase())) && (
                          <button type="button"
                                  onClick={() => { setSelectedDeptId(''); setDeptDropOpen(false); setDeptSearch('') }}
                                  className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                                  style={{
                                    color: selectedDeptId === '' ? '#3772ff' : 'var(--text-3)',
                                    background: selectedDeptId === '' ? 'rgba(55,114,255,0.08)' : 'transparent',
                                    fontStyle: 'italic',
                                  }}
                                  onMouseEnter={e => { if (selectedDeptId !== '') (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                                  onMouseLeave={e => { if (selectedDeptId !== '') (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                            — Определить автоматически —
                          </button>
                        )}
                        {departments
                          .filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                          .map(dept => (
                            <button key={dept.id} type="button"
                                    onClick={() => { setSelectedDeptId(String(dept.id)); setDeptDropOpen(false); setDeptSearch('') }}
                                    className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                                    style={{
                                      color: String(dept.id) === selectedDeptId ? '#3772ff' : 'var(--text-2)',
                                      background: String(dept.id) === selectedDeptId ? 'rgba(55,114,255,0.08)' : 'transparent',
                                    }}
                                    onMouseEnter={e => { if (String(dept.id) !== selectedDeptId) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                                    onMouseLeave={e => { if (String(dept.id) !== selectedDeptId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                              <span className="block truncate">{dept.name}</span>
                              {dept.short_name && <span className="text-[10px] opacity-50">{dept.short_name}</span>}
                            </button>
                          ))}
                        {departments.filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-3 text-[11px] text-center" style={{ color: 'var(--text-4)' }}>Ничего не найдено</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Excel upload + template download */}
              {selectedDeptId && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) { handleExcelUpload(f); e.target.value = '' }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => excelInputRef.current?.click()}
                    disabled={excelUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-md)', color: 'var(--text-2)' }}
                  >
                    {excelUploading ? (
                      <span className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--text-4)', borderTopColor: 'transparent' }} />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    )}
                    {excelUploading ? 'Загрузка...' : 'Загрузить Excel функций'}
                    {excelUploadResult && !excelUploading && (
                      <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                        {excelUploadResult.rows} строк
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
                        const res = await tauriFetch(getDepartmentExcelTemplateUrl(), { headers: {} })
                        const buf = await res.arrayBuffer()
                        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = 'otdel_functions_template.xlsx'; a.click()
                        URL.revokeObjectURL(url)
                      } catch {}
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border-md)', color: 'var(--text-3)' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Шаблон
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Hidden xlsx picker — triggered per file */}
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={e => {
              const xf = e.target.files?.[0]
              if (xf && xlsxTargetRef.current) handleAttachExcel(xlsxTargetRef.current, xf)
              e.target.value = ''
            }}
          />

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
              onChange={e => { addFiles(e.target.files); if (e.target.files) autoLinkXlsx(e.target.files) }} />
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
                  const edit = savedEdits.get(f.name)
                  const displayGuName = cached?.gu_name || (edit?.guId ? orgs.find(o => String(o.id) === edit.guId)?.name : undefined)
                  const displayDeptName = edit?.deptName
                    || cached?.suggested_dept_unit_name
                    || cached?.suggested_dept_name
                    || (levelType === 'dept' && selectedDeptId ? departments.find(d => String(d.id) === selectedDeptId)?.name : undefined)
                    || undefined
                  return (
                    <div key={f.name} className="px-3.5 py-2.5 transition-colors"
                         onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                         onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      {/* Row 1: icon + full name + status badge + remove */}
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-md bg-gov-blue/20 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-gov-blue text-[10px] font-bold">W</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium leading-snug break-all" style={{ color: 'var(--text-2)' }}>{f.name}</span>
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
                      {/* Meta: GU + dept + inline editor */}
                      {cached && (
                        <div className="ml-8 mt-1">
                          {/* Display row */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {displayGuName && (
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 opacity-40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                <span className="text-[10px] leading-snug" style={{ color: 'var(--text-3)' }}>{displayGuName}</span>
                              </div>
                            )}
                            {displayDeptName && (
                              <div className="flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3772ff', opacity: 0.7 }}><polyline points="9 18 15 12 9 6"/></svg>
                                <span className="text-[10px] leading-snug font-medium" style={{ color: '#3772ff', opacity: 0.85 }}>{displayDeptName}</span>
                              </div>
                            )}
                            {/* Edit toggle button */}
                            <button
                              onClick={() => fileEditingOrg === f.name ? setFileEditingOrg(null) : openFileOrgEdit(f.name)}
                              title="Изменить ГУ / Отдел"
                              className="flex items-center gap-0.5 text-[9.5px] font-medium px-1.5 py-0.5 rounded-md transition-all"
                              style={fileEditingOrg === f.name
                                ? { background: 'rgba(55,114,255,0.18)', color: '#93b4ff', border: '1px solid rgba(55,114,255,0.35)' }
                                : { background: 'var(--surface-1)', color: 'var(--text-4)', border: '1px solid var(--border)' }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              {fileEditingOrg === f.name ? 'Закрыть' : 'Изменить'}
                            </button>
                          </div>

                          {/* Inline editor */}
                          {fileEditingOrg === f.name && (
                            <div className="mt-2 p-2.5 rounded-lg space-y-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-md)' }}>
                              {/* GU selector */}
                              <div>
                                <p className="text-[9.5px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Управление (ГУ)</p>
                                <input
                                  value={fileEditOrgSearch}
                                  onChange={e => setFileEditOrgSearch(e.target.value)}
                                  placeholder="Поиск организации…"
                                  className="w-full text-[10px] px-2 py-1.5 rounded-md outline-none mb-1"
                                  style={{ background: 'var(--surface-0)', color: 'var(--text-1)', border: '1px solid var(--border-md)' }}
                                />
                                <div className="max-h-28 overflow-y-auto rounded-md" style={{ border: '1px solid var(--border)' }}>
                                  {orgs
                                    .filter(o => !fileEditOrgSearch || o.name.toLowerCase().includes(fileEditOrgSearch.toLowerCase()))
                                    .map(o => (
                                      <button
                                        key={o.id}
                                        onClick={() => {
                                          const id = String(o.id)
                                          setFileEditOrgId(id)
                                          setFileEditOrgSearch('')
                                          setFileEditDeptId('')
                                          setFileEditDepts([])
                                          setFileEditDeptsLoading(true)
                                          getDepartments(id)
                                            .then(setFileEditDepts)
                                            .catch(() => setFileEditDepts([]))
                                            .finally(() => setFileEditDeptsLoading(false))
                                        }}
                                        className="w-full text-left text-[10px] px-2 py-1.5 transition-colors"
                                        style={{
                                          background: fileEditOrgId === String(o.id) ? 'rgba(55,114,255,0.15)' : 'var(--surface-0)',
                                          color: fileEditOrgId === String(o.id) ? '#93b4ff' : 'var(--text-2)',
                                          borderBottom: '1px solid var(--divide)',
                                        }}
                                      >
                                        {o.name}
                                      </button>
                                    ))}
                                </div>
                              </div>

                              {/* Dept selector — only if org is selected */}
                              {fileEditOrgId && (
                                <div>
                                  <p className="text-[9.5px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Отдел</p>
                                  {fileEditDeptsLoading ? (
                                    <p className="text-[10px]" style={{ color: 'var(--text-4)' }}>Загрузка…</p>
                                  ) : (
                                    <>
                                      <input
                                        value={fileEditDeptSearch}
                                        onChange={e => setFileEditDeptSearch(e.target.value)}
                                        placeholder="Поиск отдела…"
                                        className="w-full text-[10px] px-2 py-1.5 rounded-md outline-none mb-1"
                                        style={{ background: 'var(--surface-0)', color: 'var(--text-1)', border: '1px solid var(--border-md)' }}
                                      />
                                      <div className="max-h-28 overflow-y-auto rounded-md" style={{ border: '1px solid var(--border)' }}>
                                        <button
                                          onClick={() => setFileEditDeptId('')}
                                          className="w-full text-left text-[10px] px-2 py-1.5 italic transition-colors"
                                          style={{
                                            background: !fileEditDeptId ? 'rgba(55,114,255,0.15)' : 'var(--surface-0)',
                                            color: !fileEditDeptId ? '#93b4ff' : 'var(--text-4)',
                                            borderBottom: '1px solid var(--divide)',
                                          }}
                                        >— Управление (без отдела) —</button>
                                        {fileEditDepts
                                          .filter(d => !fileEditDeptSearch || d.name.toLowerCase().includes(fileEditDeptSearch.toLowerCase()))
                                          .map(d => (
                                            <button
                                              key={d.id}
                                              onClick={() => setFileEditDeptId(String(d.id))}
                                              className="w-full text-left text-[10px] px-2 py-1.5 transition-colors"
                                              style={{
                                                background: fileEditDeptId === String(d.id) ? 'rgba(55,114,255,0.15)' : 'var(--surface-0)',
                                                color: fileEditDeptId === String(d.id) ? '#93b4ff' : 'var(--text-2)',
                                                borderBottom: '1px solid var(--divide)',
                                              }}
                                            >
                                              {d.name}
                                            </button>
                                          ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                              {/* Save button */}
                              <button
                                onClick={() => saveFileOrgEdit(f.name)}
                                disabled={!fileEditOrgId}
                                className="w-full text-[10px] font-semibold py-1.5 rounded-md transition-all"
                                style={{
                                  background: fileEditOrgId ? 'rgba(55,114,255,0.18)' : 'var(--surface-0)',
                                  color: fileEditOrgId ? '#93b4ff' : 'var(--text-4)',
                                  border: '1px solid rgba(55,114,255,0.3)',
                                  opacity: fileEditOrgId ? 1 : 0.5,
                                }}
                              >
                                Применить
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Stats row */}
                      {cached?.stats && (
                        <div className="ml-8 mt-1.5 flex items-center gap-1 flex-wrap">
                          {[
                            { label: 'Задачи', val: cached.stats.tasks, color: '#a78bfa' },
                            { label: 'Права', val: cached.stats.rights, color: '#34d399' },
                            { label: 'Обяз.', val: cached.stats.responsibilities, color: '#f59e0b' },
                            { label: 'Функции', val: cached.stats.functions, color: '#60a5fa' },
                          ].map(({ label, val, color }) => (
                            <span key={label} className="flex items-center gap-0.5 text-[9.5px] px-1.5 py-0.5 rounded-md font-medium"
                                  style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}>
                              <span className="font-bold">{val}</span>
                              <span className="opacity-70">{label}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Row 2: action buttons */}
                      <div className="flex items-center gap-1.5 mt-2 ml-8">
                        {/* Excel attachment button */}
                        <button
                          onClick={() => { xlsxTargetRef.current = f.name; xlsxInputRef.current?.click() }}
                          title={pendingExcels.has(f.name) ? `Excel: ${pendingExcels.get(f.name)!.name}` : 'Прикрепить Excel функций'}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-all"
                          style={pendingExcels.has(f.name)
                            ? { color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }
                            : { color: 'var(--text-3)', background: 'var(--surface-1)', border: '1px solid var(--border-md)' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                          </svg>
                          {pendingExcels.has(f.name) ? '✓ Excel' : 'Excel'}
                        </button>
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
              <div className="divide-y divide-[var(--divide-md)] max-h-72 overflow-y-auto">
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
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)', wordBreak: 'break-word' }}>
                        {r.status === 'success' && <>ID: <span className="font-mono font-semibold text-gov-blue">{r.record_id}</span>{r.gu_name ? ` · ${r.gu_name}` : ''}{(r as any).dept_name ? <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(55,114,255,0.12)', color: '#93b4ff' }}>Отдел: {(r as any).dept_name}</span> : null}{(r.functions_created ?? 0) > 0 ? <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ background: 'var(--badge-ok-bg)', color: 'var(--badge-ok-fg)' }}>+{r.functions_created} функц.</span> : null}</>}
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
        <div className="shrink-0 border-t" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          {/* Progress bar */}
          {importing && importProgress && importProgress.total > 0 && (
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] truncate max-w-[75%]" style={{ color: 'var(--text-3)' }}>
                  {importProgress.filename || 'Подготовка...'}
                </span>
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'var(--text-3)' }}>
                  {importProgress.current}/{importProgress.total}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`,
                    background: 'var(--gov-blue)',
                  }}
                />
              </div>
            </div>
          )}
          <div className="p-4 flex flex-col gap-2">
            {userRole === 'operator' ? (
              <button
                onClick={handleSaveDraft}
                disabled={!files.length || importing}
                className="w-full py-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-sm hover:shadow-md"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {importing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Сохраняем черновики...
                  </span>
                ) : `Сохранить черновик${files.length ? ` (${files.length})` : ''}`}
              </button>
            ) : (
              <button
                onClick={handleImport}
                disabled={!files.length || importing}
                className="w-full py-2.5 bg-gov-blue hover:bg-gov-blue-hover active:bg-gov-blue-active disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-sm hover:shadow-md"
              >
                {importing
                  ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {importProgress
                        ? `Файл ${importProgress.current} из ${importProgress.total}...`
                        : 'Импортируем...'}
                    </span>
                  )
                  : `Импортировать${files.length ? ` (${files.length})` : ''}`}
              </button>
            )}
          </div>
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
            { id: 'registry', label: 'Реестр' },
            { id: 'history',  label: 'История импорта' },
            { id: 'audit',    label: 'Журнал действий' },
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
              {tab.id === 'registry' && !regLoading && regItems.length > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: activeTab === 'registry' ? 'rgba(55,114,255,0.15)' : 'var(--surface-0)', color: activeTab === 'registry' ? '#3772ff' : 'var(--text-4)' }}>
                  {regItems.length}
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
                                  style={{ background: 'var(--accent-violet-bg)', color: 'var(--accent-violet-fg)', border: '1px solid var(--accent-violet-border)' }}>Изменено</span>
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
          {/* ── Registry tab ─────────────────────────────────────── */}
          {activeTab === 'registry' && userRole === 'operator' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                  Мои черновики (не отправленные в planning.gov.kz)
                </p>
                <button onClick={refreshRecords} className="text-[11px] px-2.5 py-1.5 rounded-lg border transition-all"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-3)', background: 'var(--surface-0)' }}>↻</button>
              </div>
              {(() => {
                const drafts = recentRecords.filter(r => r.status === 'pending' || r.was_edited)
                if (!drafts.length) return (
                  <div className="card py-16 flex flex-col items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Нет черновиков</p>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>Загрузите документы и нажмите «Сохранить черновик»</p>
                  </div>
                )
                return (
                  <div className="card overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b" style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
                          {['ID', 'Документ', 'Данные', 'Статус', 'Дата', ''].map((h, i, arr) => (
                            <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--text-3)', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drafts.map((r, idx) => {
                          const rows = draftExcelEdits.get(r.id) ?? r.excel_rows ?? []
                          const incompleteRows = r.functions_count > 0 ? getIncompleteRows(r.excel_rows ?? []) : []
                          const missingRows = r.functions_count > (r.excel_rows?.length ?? 0)
                          const needsMeta = r.functions_count > 0 && (!r.has_function_meta || missingRows || incompleteRows.length > 0)
                          const isOpen = expandedDraftId === r.id
                          const baseBg = needsMeta
                            ? (idx % 2 === 0 ? 'rgba(251,191,36,0.05)' : 'rgba(251,191,36,0.03)')
                            : (idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)')
                          return (
                          <Fragment key={r.id}>
                          <tr className="transition-colors"
                              style={{
                                background: baseBg,
                                borderBottom: '1px solid var(--divide)',
                                borderLeft: needsMeta ? '3px solid rgba(251,191,36,0.6)' : '3px solid transparent',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = needsMeta ? 'rgba(251,191,36,0.1)' : 'var(--surface-hover)')}
                              onMouseLeave={e => (e.currentTarget.style.background = baseBg)}>
                            <td className="px-4 py-2.5 w-10 shrink-0" style={{ borderRight: '1px solid var(--border)' }}>
                              <span className="font-mono text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap"
                                    style={{ background: 'rgba(55,114,255,0.12)', color: '#60a5fa' }}>
                                #{r.id}
                              </span>
                            </td>
                            <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                              <p className="text-[11px] font-medium leading-snug" style={{ color: 'var(--text-1)' }}>{r.filename}</p>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                {r.status === 'pending'
                                  ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.12)', color: 'rgba(251,191,36,1)' }}>Черновик</span>
                                  : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>✓ Импортирован</span>
                                }
                                {r.was_edited && (
                                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>Изменено оператором</span>
                                )}
                                {/* Level badge — click to change */}
                                {(() => {
                                  const levelLabel = r.doc_type === 1 ? `Департамент${r.dept_name ? ': ' + r.dept_name : ''}` : r.dept_id ? `Отдел${r.dept_name ? ': ' + r.dept_name : ''}` : 'Управление'
                                  const levelStyle = r.doc_type === 1
                                    ? { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }
                                    : r.dept_id
                                      ? { background: 'rgba(55,114,255,0.12)', color: '#60a5fa', border: '1px solid rgba(55,114,255,0.2)' }
                                      : { background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }
                                  return (
                                    <button
                                      onClick={() => setChangingLevelDraftId(changingLevelDraftId === r.id ? null : r.id)}
                                      title="Изменить уровень"
                                      className="text-[9px] font-semibold px-1 py-0.5 rounded cursor-pointer hover:opacity-70 transition-opacity"
                                      style={levelStyle}
                                    >{levelLabel} ✎</button>
                                  )
                                })()}
                                {changingLevelDraftId === r.id && (
                                  <div className="flex items-center gap-1 mt-1 w-full">
                                    {([
                                      { label: 'Департамент', dt: 1 },
                                      { label: 'Управление',  dt: 4 },
                                      { label: 'Отдел',       dt: 5 },
                                    ] as const).map(({ label, dt }) => (
                                      <button key={dt}
                                        onClick={async () => {
                                          try {
                                            const d = r.data ?? { general_provisions: '', tasks: [], authorities_rights: [], authorities_responsibilities: [], functions: [], additions: '' }
                                            await updateDraftData(r.id, { ...d, staff_numbers: r.data?.staff_numbers ?? 1 }, { deptId: dt === 4 ? null : (r.dept_id ?? null), deptName: dt === 4 ? '' : r.dept_name ?? '' }, dt)
                                            setRecentRecords(prev => prev.map(rec => rec.id === r.id ? { ...rec, doc_type: dt, dept_id: dt === 4 ? undefined : rec.dept_id, dept_name: dt === 4 ? '' : rec.dept_name } : rec))
                                            setChangingLevelDraftId(null)
                                            showToast(`Уровень изменён на «${label}»`, 'warn')
                                          } catch (e: any) { showToast(`Ошибка: ${e?.message}`, 'err') }
                                        }}
                                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded transition-all"
                                        style={r.doc_type === dt
                                          ? { background: 'rgba(55,114,255,0.25)', color: '#93b4ff', border: '1px solid rgba(55,114,255,0.5)' }
                                          : { background: 'var(--surface-1)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                                      >{label}</button>
                                    ))}
                                    <button onClick={() => setChangingLevelDraftId(null)} className="text-[9px] px-1 py-0.5 rounded" style={{ color: 'var(--text-4)' }}>✕</button>
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] leading-snug block mt-0.5" style={{ color: 'var(--text-3)' }}>{r.gu_name || r.gu_id || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[
                                  { v: r.tasks_count,            label: 'зад', c: 'rgba(55,114,255,0.12)',  t: '#60a5fa' },
                                  { v: r.rights_count,           label: 'пр',  c: 'rgba(16,185,129,0.12)', t: '#34d399' },
                                  { v: r.functions_count,        label: 'фун', c: 'rgba(167,139,250,0.15)',t: '#a78bfa' },
                                ].map(({ v, label, c, t }) => (
                                  <span key={label} className="text-[10px] font-semibold px-1 py-0.5 rounded"
                                        style={{ background: c, color: t }}>{v} {label}</span>
                                ))}
                                {needsMeta && (
                                  <div className="relative">
                                    <button
                                      onClick={() => setExpandedDraftId(isOpen ? null : r.id)}
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all"
                                      style={{
                                        background: isOpen ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.15)',
                                        color: '#f59e0b',
                                        border: '1px solid rgba(251,191,36,0.3)',
                                      }}
                                    >
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
                                      </svg>
                                      {!r.has_function_meta || missingRows ? 'нет метаданных' : `${incompleteRows.length} фун. с ошибками`}
                                      <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d={isOpen ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                      </svg>
                                    </button>

                                    {/* Warning dropdown */}
                                    {isOpen && (
                                      <div
                                        className="absolute left-0 top-full mt-1 z-50 rounded-xl shadow-lg overflow-hidden"
                                        style={{
                                          minWidth: 340,
                                          background: 'var(--surface-1)',
                                          border: '1px solid rgba(251,191,36,0.35)',
                                          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                                        }}
                                      >
                                        {/* Header with summary */}
                                        <div className="px-3 py-2.5 flex items-center justify-between gap-3" style={{ background: 'rgba(251,191,36,0.12)', borderBottom: '1px solid rgba(251,191,36,0.2)' }}>
                                          <div className="flex items-center gap-2">
                                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth={2.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
                                            </svg>
                                            <span className="text-[11px] font-semibold" style={{ color: '#f59e0b' }}>
                                              {!r.has_function_meta || missingRows ? 'Метаданные не заполнены' : `${incompleteRows.length} функц. с пропусками`}
                                            </span>
                                          </div>
                                          {!missingRows && !(!r.has_function_meta) && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.2)', color: '#b45309' }}>
                                              {incompleteRows.reduce((s, x) => s + x.missing.length, 0)} полей пусто
                                            </span>
                                          )}
                                        </div>

                                        {!r.has_function_meta || missingRows ? (
                                          <div className="px-3 py-3">
                                            <p className="text-[11px] mb-2.5" style={{ color: 'var(--text-3)' }}>
                                              Метаданные отсутствуют для всех {r.functions_count} функций. Откройте редактор и заполните обязательные поля.
                                            </p>
                                            <p className="text-[9.5px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-4)' }}>Обязательные поля</p>
                                            <div className="flex flex-wrap gap-1">
                                              {REQUIRED_META.map(f => (
                                                <span key={f.key as string} className="text-[10px] px-1.5 py-0.5 rounded"
                                                      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                                                  {f.label}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="max-h-72 overflow-y-auto divide-y" style={{ borderColor: 'var(--divide)' }}>
                                            {incompleteRows.map(({ row: fnRow, i: fnIdx, missing }) => {
                                              const total = REQUIRED_META.length
                                              const filled = total - missing.length
                                              const pct = Math.round((filled / total) * 100)
                                              return (
                                              <div key={fnIdx} className="px-3 py-2.5">
                                                <div className="flex items-start gap-2 mb-2">
                                                  <span className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold mt-0.5"
                                                        style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>{fnIdx + 1}</span>
                                                  <p className="text-[10.5px] font-medium leading-snug flex-1" style={{ color: 'var(--text-2)' }}>
                                                    {fnRow.function_name_ru || '(без названия)'}
                                                  </p>
                                                </div>
                                                {/* Progress bar */}
                                                <div className="flex items-center gap-2 mb-1.5">
                                                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-0)' }}>
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct < 50 ? '#ef4444' : pct < 80 ? '#f59e0b' : '#10b981' }} />
                                                  </div>
                                                  <span className="text-[9px] font-semibold shrink-0" style={{ color: 'var(--text-4)' }}>{filled}/{total}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                  {missing.map(f => (
                                                    <span key={f.key as string} className="text-[10px] px-1.5 py-0.5 rounded"
                                                          style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                                                      {f.label}
                                                    </span>
                                                  ))}
                                                </div>
                                              </div>
                                            )})}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                              {(() => {
                                const DRAFT_STATUSES: { value: DraftStatus; label: string; bg: string; color: string }[] = [
                                  { value: 'in_progress', label: 'В работе',     bg: 'rgba(251,191,36,0.12)',  color: 'rgba(251,191,36,1)'  },
                                  { value: 'review',      label: 'На проверке',  bg: 'rgba(55,114,255,0.12)',  color: '#93b4ff'             },
                                  { value: 'revision',    label: 'На доработке', bg: 'rgba(239,68,68,0.12)',   color: '#f87171'             },
                                  { value: 'approved',    label: 'Согласован',   bg: 'rgba(16,185,129,0.12)', color: '#34d399'             },
                                ]
                                const cur = DRAFT_STATUSES.find(s => s.value === r.draft_status) ?? DRAFT_STATUSES[0]
                                const BLOCKED = new Set<DraftStatus>(['review', 'approved'])
                                return (
                                  <div>
                                    <div className="relative inline-flex items-center">
                                      <select
                                        value={r.draft_status ?? 'in_progress'}
                                        onChange={async e => {
                                          const next = e.target.value as DraftStatus
                                          if (needsMeta && BLOCKED.has(next)) {
                                            e.currentTarget.value = r.draft_status ?? 'in_progress'
                                            showToast(
                                              next === 'approved'
                                                ? 'Нельзя согласовать: сначала заполните метаданные всех функций'
                                                : 'Нельзя отправить на проверку: сначала заполните метаданные всех функций',
                                              'warn'
                                            )
                                            return
                                          }
                                          try {
                                            await updateDraftStatus(r.id, next)
                                            setRecentRecords(prev => prev.map(x => x.id === r.id ? { ...x, draft_status: next } : x))
                                          } catch {}
                                        }}
                                        className="text-[10px] font-semibold pl-2.5 pr-6 py-1 rounded-full cursor-pointer outline-none border"
                                        style={{
                                          background: cur.bg,
                                          color: cur.color,
                                          borderColor: cur.color + '55',
                                          appearance: 'none',
                                          WebkitAppearance: 'none',
                                        }}
                                      >
                                        {DRAFT_STATUSES.map(s => (
                                          <option key={s.value} value={s.value}
                                                  style={{ background: 'var(--surface-1)', color: 'var(--text-1)' }}>
                                            {s.label}{needsMeta && BLOCKED.has(s.value) ? ' 🔒' : ''}
                                          </option>
                                        ))}
                                      </select>
                                      <svg
                                        className="pointer-events-none absolute right-1.5 w-3 h-3"
                                        style={{ color: cur.color }}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </div>
                                    {needsMeta && (
                                      <p className="mt-1 text-[9px] leading-tight" style={{ color: '#f59e0b', maxWidth: 160 }}>
                                        🔒 «На проверке» и «Согласован» недоступны — заполните метаданные функций
                                      </p>
                                    )}
                                  </div>
                                )
                              })()}
                            </td>
                            <td className="px-4 py-2.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-4)', borderRight: '1px solid var(--border)' }}>
                              {new Date(r.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => {
                                  const preview: PreviewResult = {
                                    filename: r.filename,
                                    gu_id: r.gu_id || null,
                                    gu_name: r.gu_name || null,
                                    detected_source: null,
                                    stats: {
                                      rights: r.rights_count,
                                      responsibilities: r.responsibilities_count,
                                      tasks: r.tasks_count,
                                      functions: r.functions_count,
                                    },
                                    issues: [],
                                    warnings: [],
                                    can_import: false,
                                    data: r.data ?? {
                                      general_provisions: '',
                                      tasks: [],
                                      authorities_rights: [],
                                      authorities_responsibilities: [],
                                      functions: [],
                                      additions: '',
                                    },
                                  }
                                  // Seed excel rows from the saved draft so ExcelMetaPanel shows existing data
                                  if (r.excel_rows && r.excel_rows.length > 0) {
                                    setExcelRows(prev => new Map(prev).set(r.filename, r.excel_rows!))
                                  }
                                  editingDraftIdRef.current = r.id
                                  setEditingDraftId(r.id)
                                  const draftLevel = r.doc_type === 1 ? 'dept' : (r.doc_type === 5 || r.dept_id) ? 'otdel' : 'gu'
                                  if (r.dept_name) {
                                    const alreadyLoaded = selectedOrgId === r.gu_id && levelType === draftLevel && departments.length > 0
                                    if (alreadyLoaded) {
                                      const found = departments.find(d => d.name === r.dept_name)
                                        || departments.find(d => d.name.toLowerCase().includes((r.dept_name ?? '').toLowerCase().slice(0, 30)))
                                      if (found) setSelectedDeptId(String(found.id))
                                    } else {
                                      pendingDeptNameRef.current = r.dept_name
                                    }
                                  }
                                  if (levelType !== draftLevel) setLevelType(draftLevel as 'dept' | 'gu' | 'otdel')
                                  if (r.gu_id && r.gu_id !== selectedOrgId) setSelectedOrgId(r.gu_id)
                                  setPreviewResult({
                                    ...preview,
                                    suggested_dept_unit_id: r.doc_type === 1 && r.dept_id ? r.dept_id : null,
                                    suggested_dept_unit_name: r.doc_type === 1 && r.dept_name ? r.dept_name : null,
                                    suggested_dept_id:   r.doc_type !== 1 && r.dept_id ? String(r.dept_id) : undefined,
                                    suggested_dept_name: r.doc_type !== 1 && r.dept_name ? r.dept_name    : undefined,
                                  })
                                }}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
                                style={{ background: 'rgba(55,114,255,0.12)', color: '#93b4ff', border: '1px solid rgba(55,114,255,0.2)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(55,114,255,0.22)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(55,114,255,0.12)' }}
                              >
                                Редактировать
                              </button>
                            </td>
                          </tr>

                          </Fragment>
                        )})}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {activeTab === 'registry' && userRole === 'admin' && (
            <div className="space-y-3">
              {/* Top-level sub-tabs: Черновики / Реестр */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 p-0.5 rounded-lg self-start" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
                {([
                  { id: 'drafts',   label: 'Черновики операторов' },
                  { id: 'registry', label: 'Реестр planning.gov.kz' },
                ] as const).map(({ id, label }) => (
                  <button key={id} onClick={() => setAdminRegSubTab(id)}
                    className="px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all"
                    style={adminRegSubTab === id
                      ? { background: 'var(--surface-hover)', color: 'var(--text-1)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }
                      : { color: 'var(--text-3)' }}>
                    {label}
                    {id === 'drafts' && (() => {
                      const pending = recentRecords.filter(r => r.status === 'pending').length
                      return pending > 0 ? (
                        <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(251,191,36,0.18)', color: 'rgba(251,191,36,1)' }}>
                          {pending}
                        </span>
                      ) : null
                    })()}
                  </button>
                ))}
              </div>
              {adminRegSubTab === 'drafts' && (
                <button
                  onClick={async () => {
                    const next = !showDeletedDrafts
                    setShowDeletedDrafts(next)
                    if (next) {
                      setLoadingDeleted(true)
                      try { const r = await getRecords(true); setDeletedRecords(r.records) }
                      catch {} finally { setLoadingDeleted(false) }
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all self-start"
                  style={showDeletedDrafts
                    ? { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                    : { background: 'var(--surface-1)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
                  {showDeletedDrafts ? 'Скрыть удалённые' : 'Удалённые'}
                  {deletedRecords.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>{deletedRecords.length}</span>}
                </button>
              )}
              </div>

              {/* ── Deleted drafts panel ── */}
              {adminRegSubTab === 'drafts' && showDeletedDrafts && (
                <div className="card overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                    <svg className="w-3.5 h-3.5" style={{ color: '#f87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
                    <span className="text-[11px] font-semibold" style={{ color: '#f87171' }}>Удалённые черновики</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>— можно восстановить</span>
                  </div>
                  {loadingDeleted ? (
                    <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-md)', borderTopColor: '#f87171' }} /></div>
                  ) : deletedRecords.length === 0 ? (
                    <p className="py-8 text-center text-xs" style={{ color: 'var(--text-4)' }}>Нет удалённых черновиков</p>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr style={{ background: 'var(--surface-0)', borderBottom: '1px solid var(--border)' }}>
                          {['ID', 'Документ', 'Организация', 'Дата удаления', ''].map((h, i, arr) => (
                            <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--text-3)', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {deletedRecords.map((r, idx) => (
                          <tr key={r.id} style={{ background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)', borderBottom: '1px solid var(--divide)' }}>
                            <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                              <span className="font-mono text-[11px] font-bold px-2 py-1 rounded-md" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>#{r.id}</span>
                            </td>
                            <td className="px-4 py-2.5 max-w-[220px]" style={{ borderRight: '1px solid var(--border)' }}>
                              <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-2)' }}>{r.filename}</p>
                            </td>
                            <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                              <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{r.gu_name || r.gu_id || '—'}</span>
                            </td>
                            <td className="px-4 py-2.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-4)', borderRight: '1px solid var(--border)' }}>
                              {new Date(r.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={async () => {
                                  try {
                                    await restoreDraft(r.id)
                                    setDeletedRecords(prev => prev.filter(x => x.id !== r.id))
                                    await refreshRecords()
                                  } catch (e: any) { alert('Ошибка: ' + e?.message) }
                                }}
                                className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
                                style={{ background: 'rgba(16,185,129,0.10)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.20)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.10)' }}
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                Восстановить
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── Drafts sub-tab ── */}
              {adminRegSubTab === 'drafts' && (() => {
                const DRAFT_STATUSES: { value: DraftStatus; label: string; bg: string; color: string }[] = [
                  { value: 'in_progress', label: 'В работе',      bg: 'rgba(251,191,36,0.12)',  color: 'rgba(251,191,36,1)'  },
                  { value: 'review',      label: 'На проверке',   bg: 'rgba(55,114,255,0.12)',  color: '#93b4ff'             },
                  { value: 'revision',    label: 'На доработке',  bg: 'rgba(239,68,68,0.12)',   color: '#f87171'             },
                  { value: 'approved',    label: 'Согласован',    bg: 'rgba(16,185,129,0.12)', color: '#34d399'             },
                ]
                const allDrafts = recentRecords.filter(r => r.status === 'pending' || r.was_edited)
                const drafts = allDrafts.filter(r => {
                  if (draftFilterStatus !== 'all' && r.draft_status !== draftFilterStatus) return false
                  if (draftFilterEdited && !r.was_edited) return false
                  if (draftSearch.trim()) {
                    const q = draftSearch.toLowerCase()
                    if (!r.filename.toLowerCase().includes(q) && !(r.gu_name ?? '').toLowerCase().includes(q)) return false
                  }
                  return true
                })
                const draftActiveFilters = (draftFilterStatus !== 'all' ? 1 : 0) + (draftFilterEdited ? 1 : 0) + (draftSearch.trim() ? 1 : 0)
                if (!allDrafts.length) return (
                  <div className="card py-16 flex flex-col items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Нет черновиков</p>
                    <p className="text-xs" style={{ color: 'var(--text-4)' }}>Операторы ещё не сохранили ни одного документа</p>
                  </div>
                )
                return (
                  <div className="space-y-3">
                  {/* Filter bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: 'var(--text-4)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input type="text" value={draftSearch} onChange={e => setDraftSearch(e.target.value)}
                        placeholder="Поиск по файлу или организации..."
                        className="w-full pl-7 pr-7 py-1.5 rounded-lg text-xs outline-none"
                        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                      {draftSearch && (
                        <button onClick={() => setDraftSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100" style={{ color: 'var(--text-3)' }}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {([['all', 'Все'], ['in_progress', 'В работе'], ['review', 'На проверке'], ['revision', 'На доработке'], ['approved', 'Согласован']] as [string, string][]).map(([val, label]) => (
                        <button key={val} onClick={() => setDraftFilterStatus(val)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                          style={draftFilterStatus === val
                            ? { background: 'rgba(55,114,255,0.2)', color: '#60a5fa', border: '1px solid rgba(55,114,255,0.35)' }
                            : { background: 'var(--surface-1)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setDraftFilterEdited(v => !v)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                      style={draftFilterEdited
                        ? { background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }
                        : { background: 'var(--surface-1)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      Изменённые
                    </button>
                    {draftActiveFilters > 0 && (
                      <button onClick={() => { setDraftSearch(''); setDraftFilterStatus('all'); setDraftFilterEdited(false) }}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Сбросить ({draftActiveFilters})
                      </button>
                    )}
                    {draftActiveFilters > 0 && (
                      <span className="text-[11px] ml-auto" style={{ color: 'var(--text-4)' }}>{drafts.length} из {allDrafts.length}</span>
                    )}
                  </div>
                  <div className="card overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b" style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
                          {['ID', 'Документ', 'Организация', 'Данные', 'Статус', 'Дата', 'Действия'].map((h, i, arr) => (
                            <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--text-3)', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drafts.length === 0
                          ? <tr><td colSpan={7} className="py-12 text-center text-xs" style={{ color: 'var(--text-4)' }}>Ничего не найдено по заданным фильтрам</td></tr>
                          : drafts.map((r, idx) => {
                          const cur = DRAFT_STATUSES.find(s => s.value === r.draft_status) ?? DRAFT_STATUSES[0]
                          const ADMIN_REQUIRED: { key: keyof ExcelFunctionRow; label: string }[] = [
                            { key: 'function_name_kz',        label: 'Название (каз.)'        },
                            { key: 'function_type',           label: 'Тип функции'            },
                            { key: 'task_name',               label: 'Задача'                 },
                            { key: 'activity_area_name',      label: 'Сфера деятельности'     },
                            { key: 'sub_activity_area_name',  label: 'Подсфера'               },
                            { key: 'functional_group_name',   label: 'Функц. группа (ЕБК)'   },
                            { key: 'functional_subgroup_name',label: 'Функц. подгруппа (ЕБК)' },
                            { key: 'structural_element',      label: 'Структурный элемент'    },
                            { key: 'law_ru',                  label: 'Законодательство'       },
                            { key: 'digital_maturity',        label: 'Цифровая зрелость'      },
                          ]
                          const issues = (r.excel_rows ?? []).map((row, i) => ({
                            index: i,
                            name: row.function_name_ru,
                            missing: ADMIN_REQUIRED.filter(f => !String((row as unknown as Record<string, unknown>)[f.key as string] ?? '').trim()).map(f => f.label),
                          })).filter(x => x.missing.length > 0)
                          const missingRows = r.functions_count > (r.excel_rows?.length ?? 0)
                          const needsMeta = r.functions_count > 0 && (!r.has_function_meta || missingRows || issues.length > 0)
                          const isWarnOpen = expandedAdminWarnings.has(r.id)
                          const baseBg = needsMeta
                            ? (idx % 2 === 0 ? 'rgba(251,191,36,0.05)' : 'rgba(251,191,36,0.03)')
                            : (idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)')
                          return (
                            <Fragment key={r.id}>
                            <tr className="border-b transition-colors"
                                style={{
                                  background: baseBg,
                                  borderColor: 'var(--divide)',
                                  borderBottom: isWarnOpen ? 'none' : undefined,
                                  borderLeft: needsMeta ? '3px solid rgba(251,191,36,0.5)' : '3px solid transparent',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = needsMeta ? 'rgba(251,191,36,0.1)' : 'var(--surface-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = baseBg)}>
                              <td className="px-4 py-2.5 w-10 shrink-0" style={{ borderRight: '1px solid var(--border)' }}>
                                <span className="font-mono text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap"
                                      style={{ background: 'rgba(55,114,255,0.12)', color: '#60a5fa' }}>
                                  #{r.id}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 max-w-[200px]" style={{ borderRight: '1px solid var(--border)' }}>
                                <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-1)' }}>{r.filename}</p>
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  {r.status === 'pending'
                                    ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.12)', color: 'rgba(251,191,36,1)' }}>Черновик</span>
                                    : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>✓ Импортирован</span>
                                  }
                                  {r.was_edited && (
                                    <span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>Изменено оператором</span>
                                  )}
                                  {r.doc_type === 1
                                    ? <span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>Департамент: {r.dept_name || r.dept_id}</span>
                                    : r.dept_id
                                      ? <span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: 'rgba(55,114,255,0.12)', color: '#60a5fa', border: '1px solid rgba(55,114,255,0.2)' }}>Отдел: {r.dept_name || r.dept_id}</span>
                                      : <span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>Управление</span>
                                  }
                                </div>
                              </td>
                              <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                                <span className="text-[11px] break-words leading-snug block" style={{ color: 'var(--text-2)', maxWidth: '220px' }}>{r.gu_name || r.gu_id || '—'}</span>
                              </td>
                              <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {[
                                    { v: r.tasks_count,     label: 'зад', c: 'rgba(55,114,255,0.12)',   t: '#60a5fa' },
                                    { v: r.rights_count,    label: 'пр',  c: 'rgba(16,185,129,0.12)',  t: '#34d399' },
                                    { v: r.functions_count, label: 'фун', c: 'rgba(167,139,250,0.15)', t: '#a78bfa' },
                                  ].map(({ v, label, c, t }) => (
                                    <span key={label} className="text-[10px] font-semibold px-1 py-0.5 rounded"
                                          style={{ background: c, color: t }}>{v} {label}</span>
                                  ))}
                                  {needsMeta && (
                                    <button
                                      onClick={() => toggleAdminWarning(r.id)}
                                      title="Незаполненные поля функций"
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all"
                                      style={{
                                        background: isWarnOpen ? 'rgba(251,191,36,0.3)' : 'rgba(251,191,36,0.15)',
                                        color: '#f59e0b',
                                        border: '1px solid rgba(251,191,36,0.3)',
                                      }}
                                    >
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
                                      </svg>
                                      {!r.has_function_meta ? 'нет метаданных' : `${issues.length} фун.`}
                                      <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d={isWarnOpen ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
                                <div className="relative inline-flex items-center">
                                  <select
                                    value={r.draft_status ?? 'in_progress'}
                                    onChange={async e => {
                                      const next = e.target.value as DraftStatus
                                      try {
                                        await updateDraftStatus(r.id, next)
                                        setRecentRecords(prev => prev.map(x => x.id === r.id ? { ...x, draft_status: next } : x))
                                      } catch {}
                                    }}
                                    className="text-[10px] font-semibold pl-2.5 pr-6 py-1 rounded-full cursor-pointer outline-none border"
                                    style={{ background: cur.bg, color: cur.color, borderColor: cur.color + '55', appearance: 'none', WebkitAppearance: 'none' }}
                                  >
                                    {DRAFT_STATUSES.map(s => (
                                      <option key={s.value} value={s.value} style={{ background: 'var(--surface-1)', color: 'var(--text-1)' }}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                  <svg className="pointer-events-none absolute right-1.5 w-3 h-3" style={{ color: cur.color }}
                                       fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-4)', borderRight: '1px solid var(--border)' }}>
                                {new Date(r.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {/* Preview */}
                                  <button
                                    onClick={() => {
                                      if (r.excel_rows && r.excel_rows.length > 0) {
                                        setExcelRows(prev => new Map(prev).set(r.filename, r.excel_rows!))
                                      }
                                      editingDraftIdRef.current = r.id
                                      setEditingDraftId(r.id)
                                      const draftLevel = r.doc_type === 1 ? 'dept' : (r.doc_type === 5 || r.dept_id) ? 'otdel' : 'gu'
                                      if (r.dept_name) {
                                        const alreadyLoaded = selectedOrgId === r.gu_id && levelType === draftLevel && departments.length > 0
                                        if (alreadyLoaded) {
                                          const found = departments.find(d => d.name === r.dept_name)
                                            || departments.find(d => d.name.toLowerCase().includes((r.dept_name ?? '').toLowerCase().slice(0, 30)))
                                          if (found) setSelectedDeptId(String(found.id))
                                        } else {
                                          pendingDeptNameRef.current = r.dept_name
                                        }
                                      }
                                      if (levelType !== draftLevel) setLevelType(draftLevel as 'dept' | 'gu' | 'otdel')
                                      if (r.gu_id && r.gu_id !== selectedOrgId) setSelectedOrgId(r.gu_id)
                                      setPreviewResult({
                                        filename: r.filename, gu_id: r.gu_id || null, gu_name: r.gu_name || null,
                                        detected_source: null,
                                        suggested_dept_unit_id: r.doc_type === 1 && r.dept_id ? r.dept_id : null,
                                        suggested_dept_unit_name: r.doc_type === 1 && r.dept_name ? r.dept_name : null,
                                        suggested_dept_id:   r.doc_type !== 1 && r.dept_id ? String(r.dept_id) : undefined,
                                        suggested_dept_name: r.doc_type !== 1 && r.dept_name ? r.dept_name    : undefined,
                                        stats: { rights: r.rights_count, responsibilities: r.responsibilities_count, tasks: r.tasks_count, functions: r.functions_count },
                                        issues: [], warnings: [], can_import: false,
                                        data: r.data ?? { general_provisions: '', tasks: [], authorities_rights: [], authorities_responsibilities: [], functions: [], additions: '' },
                                      })
                                    }}
                                    className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
                                    style={{ background: 'rgba(55,114,255,0.10)', color: '#93b4ff', border: '1px solid rgba(55,114,255,0.2)' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(55,114,255,0.20)' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(55,114,255,0.10)' }}
                                  >Редактировать</button>
                                  {/* Submit to planning.gov.kz */}
                                  {r.status === 'pending' ? (
                                    <>
                                    {/* Inline штатная численность editor */}
                                    <input
                                      type="number"
                                      min={1}
                                      title="Штатная численность"
                                      value={draftStaffEdits.get(r.id) ?? r.data?.staff_numbers ?? 1}
                                      onChange={e => {
                                        const v = Math.max(1, parseInt(e.target.value) || 1)
                                        setDraftStaffEdits(prev => new Map(prev).set(r.id, v))
                                      }}
                                      onBlur={async e => {
                                        const v = Math.max(1, parseInt(e.target.value) || 1)
                                        try {
                                          await updateDraftData(r.id, { ...(r.data ?? { general_provisions: '', tasks: [], authorities_rights: [], authorities_responsibilities: [], functions: [], additions: '' }), staff_numbers: v })
                                          setRecentRecords(prev => prev.map(rec => rec.id === r.id ? { ...rec, data: { ...(rec.data ?? { general_provisions: '', tasks: [], authorities_rights: [], authorities_responsibilities: [], functions: [], additions: '' }), staff_numbers: v } } : rec))
                                        } catch {}
                                      }}
                                      className="w-14 text-[11px] text-center rounded-lg outline-none px-1.5 py-1 transition-all"
                                      style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }}
                                    />
                                    <button
                                      disabled={submittingDraftId === r.id}
                                      onClick={async () => {
                                        setSubmittingDraftId(r.id)
                                        // Always persist current staff_numbers to DB before submitting.
                                        // draftStaffEdits covers inline-input edits; r.data covers modal edits
                                        // (optimistic update sets r.data.staff_numbers synchronously on modal save).
                                        const staffVal = draftStaffEdits.get(r.id) ?? r.data?.staff_numbers
                                        if (staffVal != null) {
                                          try {
                                            await updateDraftData(r.id, { ...(r.data ?? { general_provisions: '', tasks: [], authorities_rights: [], authorities_responsibilities: [], functions: [], additions: '' }), staff_numbers: staffVal })
                                          } catch {}
                                        }
                                        try {
                                          await submitDraft(r.id)
                                          await refreshRecords()
                                          setDraftStaffEdits(prev => { const n = new Map(prev); n.delete(r.id); return n })
                                        } catch (e: any) {
                                          alert('Ошибка: ' + e?.message)
                                        } finally {
                                          setSubmittingDraftId(null)
                                        }
                                      }}
                                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
                                      style={{ background: 'rgba(16,185,129,0.10)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)', opacity: submittingDraftId === r.id ? 0.5 : 1 }}
                                      onMouseEnter={e => { if (submittingDraftId !== r.id) (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.20)' }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.10)' }}
                                    >
                                      {submittingDraftId === r.id ? '...' : 'Загрузить'}
                                    </button>
                                    </>
                                  ) : (
                                    r.url ? (
                                      <a href={r.url} target="_blank" rel="noopener noreferrer"
                                         className="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
                                         style={{ background: 'rgba(55,114,255,0.08)', color: '#93b4ff', border: '1px solid rgba(55,114,255,0.15)' }}>
                                        Открыть ↗
                                      </a>
                                    ) : null
                                  )}
                                  {/* Delete button */}
                                  <button
                                    onClick={async () => {
                                      if (!confirm('Удалить этот черновик?')) return
                                      try {
                                        await deleteDraft(r.id)
                                        setRecentRecords(prev => prev.filter(rec => rec.id !== r.id))
                                        setDeletedRecords(prev => [r, ...prev])
                                      } catch (e: any) {
                                        alert('Ошибка: ' + e?.message)
                                      }
                                    }}
                                    title="Удалить"
                                    className="text-[11px] font-medium px-2 py-1 rounded-lg transition-all"
                                    style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.18)' }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)' }}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* ── Collapsible missing-fields detail row ── */}
                            {needsMeta && isWarnOpen && (
                              <tr style={{ borderBottom: '1px solid var(--divide)', borderLeft: '3px solid rgba(251,191,36,0.5)' }}>
                                <td colSpan={7} className="px-5 pb-3 pt-0" style={{ background: 'rgba(251,191,36,0.04)' }}>
                                  {!r.has_function_meta ? (
                                    <p className="text-xs py-2" style={{ color: '#f59e0b' }}>
                                      Метаданные функций не заполнены. Откройте черновик и раскройте каждую функцию чтобы заполнить поля.
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5 pt-1">
                                      {issues.map(issue => (
                                        <div key={issue.index} className="rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                                          <p className="text-[11px] font-semibold truncate mb-1" style={{ color: '#fbbf24' }}>
                                            {issue.index + 1}. {issue.name || '(без названия)'}
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {issue.missing.map(field => (
                                              <span key={field} className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                                    style={{ background: 'rgba(251,191,36,0.15)', color: '#f59e0b' }}>
                                                {field}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  </div>
                )
              })()}

              {/* ── Registry sub-tab ── */}
              {adminRegSubTab === 'registry' && (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)' }}>
                      {([{ type: 1, label: 'Департамент' }, { type: 4, label: 'Управление' }, { type: 5, label: 'Отдел' }] as const).map(({ type, label }) => (
                        <button key={type} onClick={() => { setRegType(type); fetchRegistry(type) }}
                          className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                          style={regType === type
                            ? { background: 'var(--surface-hover)', color: 'var(--text-1)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }
                            : { color: 'var(--text-3)' }}
                        >{label}</button>
                      ))}
                    </div>
                    <div className="relative flex-1 min-w-[180px]">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: 'var(--text-4)' }}
                           fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      <input value={regSearch} onChange={e => setRegSearch(e.target.value)}
                        placeholder="Поиск..." className="w-full pl-7 pr-3 py-1.5 rounded-lg text-[11px] border outline-none"
                        style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                    </div>
                    <button onClick={() => fetchRegistry(regType)} className="text-[11px] px-2.5 py-1.5 rounded-lg border transition-all"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-3)', background: 'var(--surface-0)' }}>↻</button>
                  </div>
                  {regLoading ? (
                    <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-4)' }}>Загрузка...</div>
                  ) : regError ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <p className="text-sm font-semibold" style={{ color: 'var(--badge-err-fg)' }}>Ошибка</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>{regError}</p>
                    </div>
                  ) : (
                    <div className="card overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b" style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
                            {['ID', 'Организация', 'Статус', 'Зад', 'Пр', 'Об', 'Фун', ''].map(h => (
                              <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(regSearch.trim()
                            ? regItems.filter(it => (it.guName ?? '').toLowerCase().includes(regSearch.toLowerCase()) || (it.departmentName ?? '').toLowerCase().includes(regSearch.toLowerCase()))
                            : regItems
                          ).map((item, idx) => {
                            const name = item.guName || item.departmentName || item.committeeName || '—'
                            const statusCode = item.statusObj?.code ?? ''
                            const statusLabel = item.statusObj?.nameRu ?? statusCode
                            const statusColor = statusCode === 'APPROVED' ? '#34d399' : statusCode === 'DRAFT' ? '#fbbf24' : '#60a5fa'
                            return (
                              <tr key={item.id} className="border-b transition-colors"
                                  style={{ background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)', borderColor: 'var(--divide)' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-0)')}>
                                <td className="px-3 py-2">
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: 'rgba(55,114,255,0.12)', color: '#60a5fa' }}>#{item.id}</span>
                                </td>
                                <td className="px-3 py-2 max-w-[220px]">
                                  <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-1)' }}>{name}</p>
                                </td>
                                <td className="px-3 py-2">
                                  {statusLabel && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                                      <span style={{ color: statusColor }}>{statusLabel}</span>
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>{item.tasks?.length ?? '—'}</td>
                                <td className="px-3 py-2 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>{item.authoritiesLaw?.length ?? '—'}</td>
                                <td className="px-3 py-2 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>{item.authoritiesResponsibilities?.length ?? '—'}</td>
                                <td className="px-3 py-2 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>{item.functions?.length ?? '—'}</td>
                                <td className="px-3 py-2">
                                  <a href={`https://planning.gov.kz/rgffront#/rgffront/filter/positions/department/${item.id}/edit`}
                                     target="_blank" rel="noopener noreferrer"
                                     className="inline-flex items-center justify-center w-6 h-6 rounded transition-all"
                                     style={{ color: 'var(--text-4)', border: '1px solid var(--border)' }}
                                     onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#60a5fa'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(55,114,255,0.3)' }}
                                     onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                    </svg>
                                  </a>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {previewResult && (
        <PreviewModal
          result={previewResult}
          guId={savedEdits.get(previewResult.filename)?.guId || previewResult.gu_id || selectedOrgId || undefined}
          orgs={orgs}
          levelType={levelType}
          departments={departments.length > 0 ? departments : undefined}
          deptId={savedEdits.get(previewResult.filename)?.deptId || previewResult.suggested_dept_unit_id?.toString() || previewResult.suggested_dept_id || selectedDeptId || undefined}
          savedData={savedEdits.get(previewResult.filename)?.data}
          excelRows={excelRows.get(previewResult.filename)}
          onClose={() => { setPreviewResult(null); editingDraftIdRef.current = null; setEditingDraftId(null) }}
          onExcelRowsChange={rows => {
            const name = previewResult.filename
            setExcelRows(prev => new Map(prev).set(name, rows))
            // If editing a saved draft, persist excel rows immediately
            const draftIdForExcel = editingDraftIdRef.current
            if (draftIdForExcel != null) {
              updateDraftExcel(draftIdForExcel, rows).then(() => {
                setRecentRecords(prev => prev.map(r =>
                  r.id === draftIdForExcel
                    ? { ...r, excel_rows: rows, has_function_meta: rows.length > 0 }
                    : r
                ))
              }).catch((e: Error) => { showToast(`Ошибка сохранения метаданных: ${e?.message ?? 'неизвестная ошибка'}`, 'err') })
            }
          }}
          onSave={(data, guId, deptId) => {
            const resolvedDeptId = deptId || selectedDeptId || undefined
            // Look up name: prefer departments list (correct GU), fall back to previewResult
            const resolvedDeptName = (resolvedDeptId
              ? departments.find(d => String(d.id) === resolvedDeptId)?.name
              : undefined)
              || (resolvedDeptId === previewResult.suggested_dept_id ? previewResult.suggested_dept_name : undefined)
              || (resolvedDeptId === String(previewResult.suggested_dept_unit_id) ? (previewResult.suggested_dept_unit_name ?? undefined) : undefined)
              || undefined
            setSavedEdits(prev => new Map(prev).set(previewResult.filename, {
              data,
              guId: guId || selectedOrgId || previewResult.gu_id || '',
              deptId: resolvedDeptId,
              deptName: resolvedDeptName,
            }))
            // If editing a saved draft, persist parsed data + dept + excel rows to backend
            const draftId = editingDraftIdRef.current
            if (draftId != null) {
              // Optimistic update — reflect new data in state immediately so
              // a rapid click on Загрузить reads the correct staff_numbers
              setRecentRecords(prev => prev.map(r =>
                r.id === draftId
                  ? {
                      ...r,
                      was_edited: true,
                      status: 'pending',
                      tasks_count: data.tasks.length,
                      rights_count: data.authorities_rights.length,
                      responsibilities_count: data.authorities_responsibilities.length,
                      functions_count: data.functions.length,
                      data,
                    }
                  : r
              ))
              // Also persist dept change so it's used on next submit
              const deptPayload = resolvedDeptId !== undefined
                ? { deptId: Number(resolvedDeptId), deptName: resolvedDeptName ?? '' }
                : { deptId: null, deptName: '' }
              updateDraftData(draftId, data, deptPayload).then(() => {
                // Reflect new dept in local records state
                setRecentRecords(prev => prev.map(rec =>
                  rec.id === draftId
                    ? { ...rec, dept_id: deptPayload.deptId ?? undefined, dept_name: deptPayload.deptName }
                    : rec
                ))
                showToast('Черновик сохранён', 'warn')
              }).catch((e: Error) => { showToast(`Ошибка сохранения: ${e?.message ?? 'неизвестная ошибка'}`, 'err') })
              editingDraftIdRef.current = null
              setEditingDraftId(null)
            }
            setPreviewResult(null)
          }}
        />
      )}

      </div>{/* end flex inner row */}

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg animate-modal"
          style={{
            background: toast.type === 'warn' ? 'rgba(30,22,10,0.97)' : 'rgba(30,10,10,0.97)',
            border: `1px solid ${toast.type === 'warn' ? 'rgba(251,191,36,0.4)' : 'rgba(239,68,68,0.4)'}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            maxWidth: 480,
          }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke={toast.type === 'warn' ? '#f59e0b' : '#f87171'} strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
          <p className="text-[12px] font-medium" style={{ color: toast.type === 'warn' ? '#fbbf24' : '#f87171' }}>
            {toast.msg}
          </p>
          <button onClick={() => setToast(null)} className="ml-2 shrink-0 opacity-50 hover:opacity-100 transition-opacity" style={{ color: 'white' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
