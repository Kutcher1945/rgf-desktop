// Always points to the local Django backend (localhost:8000).
// Override via NEXT_PUBLIC_API_BASE env var if needed.
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000'

// Use Tauri HTTP plugin when running inside Tauri (bypasses WebView2 CORS restrictions).
// Falls back to native browser fetch when running in a regular browser / Next.js dev server.
import { fetch as _tauriFetch } from '@tauri-apps/plugin-http'
const tauriFetch: typeof fetch = (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__)
  ? _tauriFetch as unknown as typeof fetch
  : (...args) => fetch(...args)

const TOKEN_KEY = 'rgf_token'
const ROLE_KEY  = 'rgf_role'

export type UserRole = 'admin' | 'operator'

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function setUserRole(role: UserRole) {
  localStorage.setItem(ROLE_KEY, role)
}

export function getUserRole(): UserRole {
  if (typeof window === 'undefined') return 'admin'
  return (localStorage.getItem(ROLE_KEY) as UserRole) ?? 'admin'
}

export function clearUserRole() {
  localStorage.removeItem(ROLE_KEY)
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

export async function authLogin(login: string, password: string, loginType: 'admin' | 'operator' | 'auto' = 'auto'): Promise<{ token: string; role: UserRole }> {
  let res: Response
  try {
    res = await tauriFetch(`${BASE}/api/rgf/auth/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password, login_type: loginType }),
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
  return { token: (data as any).token as string, role: ((data as any).role ?? 'admin') as UserRole }
}

export interface Org {
  id: string | number
  name: string
}

export interface Department {
  id: number
  name: string
  short_name: string
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

export type DraftStatus = 'in_progress' | 'review' | 'revision' | 'approved'

export interface ImportedRecord {
  id: number
  record_id: number | null
  filename: string
  gu_id: string
  gu_name: string
  dept_id?: number | null
  dept_name?: string
  status: 'success' | 'skipped' | 'error' | 'pending'
  draft_status: DraftStatus
  skip_reason?: string
  error?: string
  url?: string
  was_edited: boolean
  tasks_count: number
  rights_count: number
  responsibilities_count: number
  functions_count: number
  has_function_meta: boolean
  created_at: string
  data?: PreviewData
  excel_rows?: ExcelFunctionRow[]
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
  staff_numbers?: number
}

export interface PreviewResult {
  filename: string
  gu_id: string | null
  gu_name: string | null
  detected_source: string | null
  suggested_dept_id?: string
  suggested_dept_name?: string
  /** planning.gov.kz record ID of the parent Управление (type=4) — needed as positionDepartmentId for Отдел creation */
  parent_position_record_id?: number
  /** planning.gov.kz record ID of an already-existing Отдел (type=5) for this department */
  existing_position_record_id?: number
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

export async function importParsed(guId: string, data: PreviewData, filename?: string, guName?: string, departmentId?: number, existingPositionRecordId?: number, parentPositionRecordId?: number, excelRows?: ExcelFunctionRow[]): Promise<ParsedImportResult> {
  const res = await tauriFetch(`${BASE}/api/rgf/import-parsed/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      gu_id: guId,
      gu_name: guName ?? '',
      filename: filename ?? '',
      ...(departmentId ? { department_id: departmentId } : {}),
      ...(existingPositionRecordId ? { existing_position_record_id: existingPositionRecordId } : {}),
      ...(parentPositionRecordId ? { parent_position_record_id: parentPositionRecordId } : {}),
      ...data,
      excel_rows: excelRows ?? [],
    }),
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

export async function getDepartments(guId: string | number): Promise<Department[]> {
  const res = await tauriFetch(`${BASE}/api/rgf/organizations/${guId}/departments/`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function uploadDepartmentExcel(deptId: number, file: File): Promise<{ success: boolean; rows_loaded: number }> {
  const form = new FormData()
  form.append('file', file)
  const res = await tauriFetch(`${BASE}/api/rgf/departments/${deptId}/upload-excel/`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function getDepartmentExcelTemplateUrl(): string {
  return `${BASE}/api/rgf/departments/excel-template/`
}

export interface ExcelFunctionRow {
  function_name_ru: string
  function_name_kz: string
  function_type: string
  target_task: string
  function_description: string
  structural_element: string
  law_ru: string
  law_kz?: string
  task_name: string
  is_government_service: boolean
  is_competitive_env?: boolean
  result_description: string
  digital_maturity: string
  activity_area_name: string
  sub_activity_area_name: string
  functional_group_name: string
  functional_subgroup_name: string
  // ID fields — set when user picks from dropdown; used directly by the import
  function_type_id?: number
  activity_area_id?: number
  sub_activity_area_id?: number
  digital_maturity_id?: number
  functional_group_id?: number
  functional_subgroup_id?: number
}

export interface DictItem {
  id: number
  name: string
  area_id?: number    // sub_activity_areas: parent area ID
  group_id?: number   // functional_subgroups: parent group ID
  rid?: number        // functional_groups: rid for subgroup lookup
}

export interface Dicts {
  function_types: DictItem[]
  activity_areas: DictItem[]
  sub_activity_areas: DictItem[]
  digital_maturities: DictItem[]
  functional_groups: DictItem[]
  functional_subgroups: DictItem[]
}

export async function getDicts(): Promise<Dicts> {
  const res = await tauriFetch(`${BASE}/api/rgf/dicts/`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function parseExcelFile(file: File): Promise<ExcelFunctionRow[]> {
  const form = new FormData()
  form.append('file', file)
  const res = await tauriFetch(`${BASE}/api/rgf/parse-excel/`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data as any).rows ?? []
}

export async function importDocuments(files: File[], guId?: string, departmentId?: number): Promise<ImportResponse> {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  if (guId) form.append('gu_id', guId)
  if (departmentId) form.append('department_id', String(departmentId))

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

export interface PositionDepartmentItem {
  id: number
  type: number
  guId: number
  guName: string
  departmentId: number
  departmentName: string
  committeeId: number
  committeeName: string
  positionDepartmentId: number
  staffNumbers: number
  statusObj?: { code: string; nameRu: string; badge: string }
  tasks?: { id: number; taskText: string }[]
  authoritiesLaw?: { id: number; authorityText: string }[]
  authoritiesResponsibilities?: { id: number; authorityText: string }[]
  functions?: { id: number; functionNameRu: string; functionNameKz: string }[]
}

export interface BrowseResponse {
  content: PositionDepartmentItem[]
  totalElements?: number
  totalPages?: number
  number?: number
  size?: number
}

export async function browseRecords(type: number, page = 0, size = 200): Promise<BrowseResponse> {
  const res = await tauriFetch(`${BASE}/api/rgf/browse/?type=${type}&page=${page}&size=${size}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function syncDicts(): Promise<{ ok: boolean; synced: Record<string, number> }> {
  const res = await tauriFetch(`${BASE}/api/rgf/sync-dicts/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function saveDraft(guId: string, data: PreviewData, filename?: string, guName?: string, excelRows?: ExcelFunctionRow[], deptId?: number | null, deptName?: string): Promise<{ success: boolean; id: number }> {
  const res = await tauriFetch(`${BASE}/api/rgf/save-draft/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ gu_id: guId, gu_name: guName ?? '', filename: filename ?? '', ...data, excel_rows: excelRows ?? [], dept_id: deptId ?? null, dept_name: deptName ?? '' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function updateDraftData(draftId: number, data: PreviewData): Promise<{ success: boolean }> {
  const res = await tauriFetch(`${BASE}/api/rgf/update-draft-data/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ draft_id: draftId, ...data }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function updateDraftExcel(draftId: number, excelRows: ExcelFunctionRow[]): Promise<{ success: boolean; has_function_meta: boolean }> {
  const res = await tauriFetch(`${BASE}/api/rgf/update-draft-excel/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ draft_id: draftId, excel_rows: excelRows }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function submitDraft(draftId: number): Promise<ParsedImportResult> {
  const res = await tauriFetch(`${BASE}/api/rgf/submit-draft/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ draft_id: draftId }),
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

export async function updateDraftStatus(draftId: number, draftStatus: DraftStatus): Promise<{ success: boolean; draft_status: DraftStatus }> {
  const res = await tauriFetch(`${BASE}/api/rgf/update-draft-status/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ draft_id: draftId, draft_status: draftStatus }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || `HTTP ${res.status}`)
  }
  return res.json()
}
