// In dev (npm run dev / tauri dev): NEXT_PUBLIC_API_BASE='' → uses Next.js proxy (no CORS)
// In Tauri production build (NEXT_EXPORT=true): defaults to full production URL
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://exp-admin.smartalmaty.kz'

// Use Tauri HTTP plugin (routes through Rust/reqwest) to bypass WebView2 network restrictions.
// Falls back to native fetch when running outside of Tauri (e.g. Next.js dev server).
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

const TOKEN_KEY = 'rgf_token'

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

export async function authLogin(login: string, password: string): Promise<string> {
  let res: Response
  try {
    res = await tauriFetch(`${BASE}/api/rgf/auth/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    })
  } catch (e: any) {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true
    // Plugin may throw a plain string, an Error, or a Rust error object — extract message defensively
    const rawMsg: string =
      typeof e === 'string' ? e
      : e?.message != null ? String(e.message)
      : e?.toString?.() !== '[object Object]' ? String(e)
      : JSON.stringify(e)
    const lines: string[] = []
    if (!online) {
      lines.push('Устройство не подключено к интернету.')
    } else {
      lines.push(`Сервер недоступен: ${BASE}`)
    }
    lines.push(`\nОшибка: ${rawMsg || '(нет сообщения)'}`)
    if (e?.cause != null) lines.push(`Причина: ${String(e.cause)}`)
    const err = new Error(lines.join('\n'))
    // Attach raw for debug panel
    ;(err as any).__raw = { type: typeof e, str: String(e), json: (() => { try { return JSON.stringify(e) } catch { return '?' } })() }
    throw err
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `Сервер вернул ошибку HTTP ${res.status}`)
  }
  const data = await res.json()
  return (data as any).token as string
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
  functions_created?: number
  functions_failed?: number
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
  functions_created?: number
  functions_failed?: number
}

export async function importParsed(guId: string, data: PreviewData, filename?: string, guName?: string): Promise<ParsedImportResult> {
  const res = await tauriFetch(`${BASE}/api/rgf/import-parsed/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
  const res = await tauriFetch(`${BASE}/api/rgf/ai-analyze/`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function previewDocument(file: File): Promise<PreviewResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await tauriFetch(`${BASE}/api/rgf/preview/`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getOrganizations(): Promise<Org[]> {
  const res = await tauriFetch(`${BASE}/api/rgf/organizations/`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function importDocuments(files: File[], guId?: string): Promise<ImportResponse> {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  if (guId) form.append('gu_id', guId)

  const res = await tauriFetch(`${BASE}/api/rgf/import/`, { method: 'POST', headers: authHeaders(), body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getRecords(): Promise<RecordsResponse> {
  const res = await tauriFetch(`${BASE}/api/rgf/records/`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getAuditLog(): Promise<AuditLogResponse> {
  const res = await tauriFetch(`${BASE}/api/rgf/audit/`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export interface CreateFunctionResult {
  success: boolean
  function_id: number | null
  error: string | null
  retry_after?: number
}

export async function createDepartmentFunction(
  positionDepartmentId: number,
  guId: string,
  guName: string,
  functionText: string,
): Promise<CreateFunctionResult> {
  const res = await tauriFetch(`${BASE}/api/rgf/create-department-function/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      position_department_id: positionDepartmentId,
      gu_id: guId,
      gu_name: guName,
      function_text: functionText,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteRecords(recordIds: number[]): Promise<DeleteResponse> {
  const res = await tauriFetch(`${BASE}/api/rgf/records/delete/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ record_ids: recordIds, confirm: true }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}
