// In dev (npm run dev / tauri dev): NEXT_PUBLIC_API_BASE='' → uses Next.js proxy (no CORS)
// In Tauri production build (NEXT_EXPORT=true): defaults to full production URL
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://exp-admin.smartalmaty.kz'

export async function authLogin(login: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/api/rgf/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
}

export interface Org {
  id: string | number
  name: string
}

export interface ImportResult {
  filename: string
  status: 'success' | 'skipped' | 'error'
  record_id?: number
  gu_id?: string
  gu_name?: string
  skip_reason?: string
  error?: string
  warnings?: string[]
  stats?: { rights: number; responsibilities: number; tasks: number; functions: number }
  url?: string
}

export interface ImportResponse {
  summary: { total: number; success: number; skipped: number; error: number }
  results: ImportResult[]
}

export interface ImportedRecord {
  id: number
  record_id: number | null
  filename: string
  gu_id: string
  gu_name: string
  status: 'success' | 'skipped' | 'error'
  skip_reason?: string
  error?: string
  url?: string
  was_edited: boolean
  tasks_count: number
  rights_count: number
  responsibilities_count: number
  functions_count: number
  created_at: string
}

export interface RecordsResponse {
  total: number
  records: ImportedRecord[]
}

export interface AuditLogEntry {
  id: number
  action: 'login' | 'preview' | 'import' | 'delete'
  filename: string
  gu_id: string
  gu_name: string
  status: string
  details: Record<string, any>
  created_at: string
}

export interface AuditLogResponse {
  total: number
  entries: AuditLogEntry[]
}

export interface DeleteResponse {
  total: number
  deleted_count: number
  failed_count: number
  deleted: number[]
  failed: number[]
}

export interface PreviewData {
  general_provisions: string
  tasks: string[]
  authorities_rights: string[]
  authorities_responsibilities: string[]
  functions: string[]
  additions: string
}

export interface PreviewResult {
  filename: string
  gu_id: string | null
  gu_name: string | null
  detected_source: string | null
  stats: { rights: number; responsibilities: number; tasks: number; functions: number }
  issues: string[]
  warnings: string[]
  can_import: boolean
  data: PreviewData
}

export interface ParsedImportResult {
  status: 'success' | 'skipped' | 'error'
  record_id?: number
  gu_id?: string
  skip_reason?: string
  error?: string
  warnings?: string[]
  url?: string
  stats?: { rights: number; responsibilities: number; tasks: number; functions: number }
}

export async function importParsed(guId: string, data: PreviewData, filename?: string, guName?: string): Promise<ParsedImportResult> {
  const res = await fetch(`${BASE}/api/rgf/import-parsed/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gu_id: guId, gu_name: guName ?? '', filename: filename ?? '', ...data }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function aiAnalyzeDocument(file: File): Promise<PreviewResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api/rgf/ai-analyze/`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function previewDocument(file: File): Promise<PreviewResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api/rgf/preview/`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getOrganizations(): Promise<Org[]> {
  const res = await fetch(`${BASE}/api/rgf/organizations/`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function importDocuments(files: File[], guId?: string): Promise<ImportResponse> {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  if (guId) form.append('gu_id', guId)

  const res = await fetch(`${BASE}/api/rgf/import/`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getRecords(): Promise<RecordsResponse> {
  const res = await fetch(`${BASE}/api/rgf/records/`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getAuditLog(): Promise<AuditLogResponse> {
  const res = await fetch(`${BASE}/api/rgf/audit/`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function deleteRecords(recordIds: number[]): Promise<DeleteResponse> {
  const res = await fetch(`${BASE}/api/rgf/records/delete/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_ids: recordIds, confirm: true }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}
