'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDepartments, getDicts } from '@/lib/api'
import type { Org, Department, PreviewResult, PreviewData, ExcelFunctionRow, Dicts, DictItem } from '@/lib/api'

interface Props {
  result: PreviewResult
  guId?: string
  orgs?: Org[]
  levelType?: 'dept' | 'gu' | 'otdel'
  departments?: Department[]
  deptId?: string
  savedData?: PreviewData       // previously saved edits, if any
  excelRows?: ExcelFunctionRow[] // structured rows from attached xlsx
  onClose: () => void
  onSave: (data: PreviewData, guId: string, deptId?: string) => void
  onExcelRowsChange?: (rows: ExcelFunctionRow[]) => void
}

function AutoResizeTextarea({ value, onChange, className, placeholder }: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      style={{ overflow: 'hidden', resize: 'none' }}
    />
  )
}

function createDefaultExcelRow(fnText: string): ExcelFunctionRow {
  return {
    function_name_ru: fnText,
    function_name_kz: '',
    function_type: '',
    target_task: '',
    function_description: '',
    structural_element: '',
    law_ru: '',
    task_name: '',
    is_government_service: false,
    is_competitive_env: false,
    result_description: '',
    digital_maturity: '',
    activity_area_name: '',
    sub_activity_area_name: '',
    functional_group_name: '',
    functional_subgroup_name: '',
  }
}

const SECTION_CONFIG = [
  { key: 'tasks' as const,                        label: 'Задачи',                  count_key: 'tasks',            accent: '#3772ff', bg: '#ebf1ff', text: '#2956bf' },
  { key: 'authorities_rights' as const,           label: 'Полномочия (права)',       count_key: 'rights',           accent: '#059669', bg: '#ecfdf5', text: '#065f46' },
  { key: 'authorities_responsibilities' as const,  label: 'Полномочия (обязанности)', count_key: 'responsibilities', accent: '#d97706', bg: '#fffbeb', text: '#92400e' },
  { key: 'functions' as const,                    label: 'Функции',                 count_key: 'functions',        accent: '#7c3aed', bg: '#f5f3ff', text: '#5b21b6' },
]

type ListKey = 'tasks' | 'authorities_rights' | 'authorities_responsibilities' | 'functions'

const REQUIRED_FN_FIELDS: { key: keyof ExcelFunctionRow; label: string }[] = [
  { key: 'function_name_kz',        label: 'Название (каз.)'   },
  { key: 'function_type',           label: 'Тип функции'       },
  { key: 'task_name',               label: 'Задача'            },
  { key: 'activity_area_name',      label: 'Сфера деятельности'},
  { key: 'sub_activity_area_name',  label: 'Подсфера'          },
  { key: 'functional_group_name',   label: 'Функц. группа'     },
  { key: 'functional_subgroup_name',label: 'Функц. подгруппа'  },
  { key: 'structural_element',      label: 'Структурный эл.'   },
  { key: 'law_ru',                  label: 'Законодательство'  },
  { key: 'digital_maturity',        label: 'Цифровая зрелость' },
]
function getMissingFnFields(row: ExcelFunctionRow): string[] {
  return REQUIRED_FN_FIELDS
    .filter(f => !String((row as unknown as Record<string, unknown>)[f.key as string] ?? '').trim())
    .map(f => f.label)
}

/** Find the best-matching excel row for a given function text.
 *  fnIndex: position of the function in the docx list — used as a tiebreaker
 *  when multiple Excel rows have the same word-overlap score (e.g. all functions
 *  start with "Осуществление контроля за..."). */
// Strip leading "N) " or "N. " numbering from function text before comparing
const _stripNum = (s: string) => s.replace(/^\d+[\)\.]\s+/, '')

function matchExcelRow(fnText: string, rows: ExcelFunctionRow[], fnIndex?: number): ExcelFunctionRow | undefined {
  if (!rows.length || !fnText.trim()) return undefined
  const fn = _stripNum(fnText).toLowerCase().replace(/[;,]/g, '').trim()
  // 1. Exact match
  for (const r of rows) {
    const ru = _stripNum(r.function_name_ru).toLowerCase().replace(/[;,]/g, '').trim()
    if (fn === ru) return r
  }
  // 2. Long-prefix match (≥60 chars) — avoids false positives from short shared prefixes
  for (let j = 0; j < rows.length; j++) {
    const ru = _stripNum(rows[j].function_name_ru).toLowerCase().replace(/[;,]/g, '').trim()
    const minLen = Math.min(fn.length, ru.length)
    if (minLen >= 60 && (fn.startsWith(ru.slice(0, 60)) || ru.startsWith(fn.slice(0, 60)))) return rows[j]
  }
  // 3. Word-overlap with position bonus as tiebreaker
  const words = fn.split(/\s+/).filter(w => w.length > 4)
  if (!words.length) return undefined
  let best: ExcelFunctionRow | undefined
  let bestScore = -1
  for (let j = 0; j < rows.length; j++) {
    const ru = rows[j].function_name_ru.toLowerCase()
    const textScore = words.filter(w => ru.includes(w)).length
    // Position bonus: row closest in index to fnIndex scores up to +0.5 extra
    const posBonus = fnIndex !== undefined ? Math.max(0, 0.5 - Math.abs(j - fnIndex) / rows.length) : 0
    const score = textScore + posBonus
    if (score > bestScore) { bestScore = score; best = rows[j] }
  }
  return bestScore >= Math.max(2, Math.floor(words.length * 0.4)) ? best : undefined
}

// ─── Excel metadata panel with dict dropdowns ────────────────────────────────

type UpdateFn = (rowIndex: number, field: keyof ExcelFunctionRow, value: string | boolean | number | undefined) => void

const CELL_INPUT = "w-full text-[11px] rounded border px-2 py-1 outline-none transition-colors"
const CELL_STYLE        = { color: '#1e1b4b', borderColor: '#e9d5ff', background: '#fff' }
const CELL_EMPTY_STYLE  = { color: '#92400e', borderColor: '#fbbf24', background: 'rgba(251,191,36,0.06)' }
const LABEL_STYLE       = "block text-[10px] font-semibold uppercase tracking-wide mb-1 flex items-center gap-1.5"
const LABEL_COLOR       = '#7c3aed'
const LABEL_EMPTY_COLOR = '#b45309'

function EmptyDot() {
  return (
    <span title="Не заполнено" className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0 rounded"
          style={{ background: 'rgba(251,191,36,0.2)', color: '#b45309', letterSpacing: 0 }}>
      пусто
    </span>
  )
}

function CellText({ label, field, row, rowIndex, onUpdate }: {
  label: string
  field: keyof ExcelFunctionRow
  row: ExcelFunctionRow
  rowIndex: number
  onUpdate: UpdateFn
}) {
  const val = (row[field] as string) ?? ''
  const empty = !val.trim()
  return (
    <div>
      <span className={LABEL_STYLE} style={{ color: empty ? LABEL_EMPTY_COLOR : LABEL_COLOR }}>
        {label} *{empty && <EmptyDot />}
      </span>
      <input
        type="text"
        value={val}
        onChange={e => onUpdate(rowIndex, field, e.target.value)}
        className={CELL_INPUT + ' focus:border-purple-400'}
        style={empty ? CELL_EMPTY_STYLE : CELL_STYLE}
        placeholder="—"
      />
    </div>
  )
}

function CellTextArea({ label, field, row, rowIndex, onUpdate }: {
  label: string
  field: keyof ExcelFunctionRow
  row: ExcelFunctionRow
  rowIndex: number
  onUpdate: UpdateFn
}) {
  const val = (row[field] as string) ?? ''
  const empty = !val.trim()
  return (
    <div>
      <span className={LABEL_STYLE} style={{ color: empty ? LABEL_EMPTY_COLOR : LABEL_COLOR }}>
        {label} *{empty && <EmptyDot />}
      </span>
      <textarea
        rows={2}
        value={val}
        onChange={e => onUpdate(rowIndex, field, e.target.value)}
        className={CELL_INPUT + ' resize-none focus:border-purple-400'}
        style={empty ? CELL_EMPTY_STYLE : CELL_STYLE}
        placeholder="—"
      />
    </div>
  )
}

function CellSelect({ label, idValue, items, onChange, placeholder = '— не выбрано —' }: {
  label: string
  idValue?: number
  items: DictItem[]
  onChange: (name: string, id: number | undefined) => void
  placeholder?: string
}) {
  const empty = idValue === undefined || idValue === null
  const selectedItem = items.find(x => x.id === idValue)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const openDrop = () => {
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom
      const dropH = Math.min(300, window.innerHeight * 0.45)
      const top = spaceBelow >= dropH ? r.bottom + 2 : r.top - dropH - 2
      setDropRect({ top, left: r.left, width: r.width })
    }
    setOpen(true); setSearch('')
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(t) &&
        dropRef.current   && !dropRef.current.contains(t)
      ) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = search.trim()
    ? items.filter(x => x.name.toLowerCase().includes(search.toLowerCase()))
    : items

  return (
    <div className="relative">
      <span className={LABEL_STYLE} style={{ color: empty ? LABEL_EMPTY_COLOR : LABEL_COLOR }}>
        {label} *{empty && <EmptyDot />}
      </span>
      <button
        ref={buttonRef}
        type="button"
        onClick={open ? () => { setOpen(false); setSearch('') } : openDrop}
        className={CELL_INPUT + ' flex items-center gap-1 text-left w-full focus:border-purple-400'}
        style={empty ? CELL_EMPTY_STYLE : CELL_STYLE}
      >
        <span className="flex-1 truncate" style={{ color: empty ? '#9ca3af' : 'inherit' }}>
          {selectedItem?.name || placeholder}
        </span>
        <svg className="w-3 h-3 shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && dropRect && (
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top: dropRect.top,
            left: dropRect.left,
            width: Math.max(dropRect.width, 260),
            zIndex: 9999,
            border: '1px solid #e9d5ff',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(109,40,217,0.15)',
            background: '#fff',
            color: '#1f2937',
            overflow: 'hidden',
          }}
        >
          <div className="p-1.5 border-b border-purple-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full text-[11px] px-2 py-1 rounded outline-none"
              style={{ border: '1px solid #d8b4fe', color: '#1f2937', background: '#fff' }}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <div
              className="px-3 py-1.5 text-[11px] cursor-pointer hover:bg-purple-50"
              style={{ color: '#9ca3af' }}
              onMouseDown={() => { onChange('', undefined); setOpen(false); setSearch('') }}
            >{placeholder}</div>
            {filtered.map(x => (
              <div
                key={x.id}
                className="px-3 py-1.5 text-[11px] cursor-pointer hover:bg-purple-50 leading-snug"
                style={x.id === idValue ? { background: '#f3e8ff', fontWeight: 500, color: '#6d28d9' } : { color: '#1f2937' }}
                onMouseDown={() => { onChange(x.name, x.id); setOpen(false); setSearch('') }}
              >{x.name}</div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-center" style={{ color: '#9ca3af' }}>Ничего не найдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CellBool({ label, field, row, rowIndex, onUpdate }: {
  label: string
  field: keyof ExcelFunctionRow
  row: ExcelFunctionRow
  rowIndex: number
  onUpdate: UpdateFn
}) {
  return (
    <div>
      <span className={LABEL_STYLE} style={{ color: '#7c3aed' }}>{label} *</span>
      <select
        value={(row[field] as boolean) ? 'yes' : 'no'}
        onChange={e => onUpdate(rowIndex, field, e.target.value === 'yes')}
        className={CELL_INPUT}
        style={CELL_STYLE}
      >
        <option value="no">Нет</option>
        <option value="yes">Да</option>
      </select>
    </div>
  )
}

function TaskSelect({ value, tasks, empty, onChange }: {
  value: string
  tasks: string[]
  empty: boolean
  onChange: (v: string) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const openDrop = () => {
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect()
      // prefer opening below; if not enough room, open above
      const spaceBelow = window.innerHeight - r.bottom
      const dropH = Math.min(340, window.innerHeight * 0.45)
      const top = spaceBelow >= dropH ? r.bottom + 2 : r.top - dropH - 2
      setDropRect({ top, left: r.left, width: r.width })
    }
    setOpen(true)
    setSearch('')
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(t) &&
        dropRef.current   && !dropRef.current.contains(t)
      ) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = search.trim()
    ? tasks.filter(t => t.toLowerCase().includes(search.toLowerCase()))
    : tasks

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={open ? () => { setOpen(false); setSearch('') } : openDrop}
        className={CELL_INPUT + ' flex items-center gap-1 text-left w-full focus:border-purple-400'}
        style={empty ? CELL_EMPTY_STYLE : CELL_STYLE}
      >
        <span className="flex-1 line-clamp-2 text-left" style={{ color: !value ? '#9ca3af' : 'inherit' }}>
          {value || '— выберите задачу —'}
        </span>
        <svg className="w-3 h-3 shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && dropRect && (
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top: dropRect.top,
            left: dropRect.left,
            width: Math.max(dropRect.width, 320),
            zIndex: 9999,
            border: '1px solid #e9d5ff',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(109,40,217,0.15)',
            background: '#fff',
            color: '#1f2937',
            overflow: 'hidden',
          }}
        >
          <div className="p-1.5 border-b border-purple-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск задачи..."
              className="w-full text-[11px] px-2 py-1 rounded outline-none"
              style={{ border: '1px solid #d8b4fe', color: '#1f2937', background: '#fff' }}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            <div className="px-3 py-1.5 text-[11px] cursor-pointer hover:bg-purple-50"
              style={{ color: '#9ca3af' }}
              onMouseDown={() => { onChange(''); setOpen(false); setSearch('') }}>— выберите задачу —</div>
            {filtered.map((t, idx) => (
              <div key={idx}
                className="px-3 py-2 text-[11px] cursor-pointer hover:bg-purple-50 leading-snug"
                style={t === value ? { background: '#f3e8ff', fontWeight: 500, color: '#6d28d9' } : { color: '#1f2937' }}
                onMouseDown={() => { onChange(t); setOpen(false); setSearch('') }}
              >{t}</div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-center" style={{ color: '#9ca3af' }}>Ничего не найдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ExcelMetaPanel({ row, rowIndex, dicts, tasks, onUpdate }: {
  row: ExcelFunctionRow
  rowIndex: number
  dicts: Dicts | null
  tasks: string[]
  onUpdate: UpdateFn
}) {
  const subAreas = dicts ? (() => {
    if (!row.activity_area_id) return dicts.sub_activity_areas
    const filtered = dicts.sub_activity_areas.filter(x => x.area_id === row.activity_area_id)
    return filtered.length ? filtered : dicts.sub_activity_areas
  })() : []
  const subGroups = dicts ? (() => {
    if (!row.functional_group_id) return dicts.functional_subgroups
    const filtered = dicts.functional_subgroups.filter(x => x.group_id === row.functional_group_id)
    return filtered.length ? filtered : dicts.functional_subgroups
  })() : []

  const grid = "grid grid-cols-2 gap-3 px-4 py-3 border-b border-purple-100 last:border-0"
  const availableTasks = tasks.filter(t => t.trim())

  // Highlight when empty OR when value doesn't match any option (select shows placeholder)
  const taskEmpty = !(row.task_name ?? '').trim()
    || (availableTasks.length > 0 && !availableTasks.includes(row.task_name ?? ''))

  return (
    <div className="ml-12 mr-4 mb-2 rounded-lg overflow-hidden text-[11px]" style={{ background: '#faf5ff', border: '1px solid #e9d5ff' }}>

      {/* Row 1: Наименование законодательства РК (full width — paired with МИО in origin, which we don't show per-function) */}
      <div className="px-4 py-3 border-b border-purple-100">
        <CellText label="Наименование законодательства РК" field="law_ru" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
      </div>

      {/* Row 2: Структурный элемент | Целевая задача */}
      <div className={grid}>
        <CellText label="Структурный элемент" field="structural_element" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        <CellText label="Целевая задача" field="target_task" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
      </div>

      {/* Row 3: Наименование функции на русском | Наименование функции на казахском */}
      <div className={grid}>
        <CellTextArea label="Наименование функции на русском" field="function_name_ru" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        <CellTextArea label="Наименование функции на казахском" field="function_name_kz" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
      </div>

      {/* Row 4: Тип функции | Описание функции */}
      <div className={grid}>
        {dicts ? (
          <CellSelect label="Тип функции" idValue={row.function_type_id} items={dicts.function_types}
            onChange={(name, id) => { onUpdate(rowIndex, 'function_type', name); onUpdate(rowIndex, 'function_type_id', id) }} />
        ) : (
          <CellText label="Тип функции" field="function_type" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        )}
        <CellTextArea label="Описание функции" field="function_description" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
      </div>

      {/* Row 5: Реализуется через конкурентную среду | Является госуслугой */}
      <div className={grid}>
        <CellBool label="Реализуется через конкурентную среду" field="is_competitive_env" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        <CellBool label="Является госуслугой" field="is_government_service" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
      </div>

      {/* Row 6: Сфера деятельности | Подсфера деятельности */}
      <div className={grid}>
        {dicts ? (
          <CellSelect label="Сфера деятельности" idValue={row.activity_area_id} items={dicts.activity_areas}
            onChange={(name, id) => {
              onUpdate(rowIndex, 'activity_area_name', name); onUpdate(rowIndex, 'activity_area_id', id)
              onUpdate(rowIndex, 'sub_activity_area_name', ''); onUpdate(rowIndex, 'sub_activity_area_id', undefined)
            }} />
        ) : (
          <CellText label="Сфера деятельности" field="activity_area_name" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        )}
        {dicts ? (
          <CellSelect label="Подсфера деятельности" idValue={row.sub_activity_area_id} items={subAreas}
            onChange={(name, id) => { onUpdate(rowIndex, 'sub_activity_area_name', name); onUpdate(rowIndex, 'sub_activity_area_id', id) }} />
        ) : (
          <CellText label="Подсфера деятельности" field="sub_activity_area_name" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        )}
      </div>

      {/* Row 7: Функциональная группа (ЕБК) | Функциональная подгруппа (ЕБК) */}
      <div className={grid}>
        {dicts ? (
          <CellSelect label="Функциональная группа (ЕБК)" idValue={row.functional_group_id} items={dicts.functional_groups}
            onChange={(name, id) => {
              onUpdate(rowIndex, 'functional_group_name', name); onUpdate(rowIndex, 'functional_group_id', id)
              onUpdate(rowIndex, 'functional_subgroup_name', ''); onUpdate(rowIndex, 'functional_subgroup_id', undefined)
            }} />
        ) : (
          <CellText label="Функциональная группа (ЕБК)" field="functional_group_name" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        )}
        {dicts ? (
          <CellSelect label="Функциональная подгруппа (ЕБК)" idValue={row.functional_subgroup_id} items={subGroups}
            onChange={(name, id) => { onUpdate(rowIndex, 'functional_subgroup_name', name); onUpdate(rowIndex, 'functional_subgroup_id', id) }} />
        ) : (
          <CellText label="Функциональная подгруппа (ЕБК)" field="functional_subgroup_name" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        )}
      </div>

      {/* Row 8: Наименование задачи | Цифровая зрелость */}
      <div className={grid}>
        <div>
          <span className={LABEL_STYLE} style={{ color: taskEmpty ? LABEL_EMPTY_COLOR : '#7c3aed' }}>
            Наименование задачи *{taskEmpty && <EmptyDot />}
          </span>
          {availableTasks.length > 0
            ? <TaskSelect value={row.task_name ?? ''} tasks={availableTasks} empty={taskEmpty}
                onChange={v => onUpdate(rowIndex, 'task_name', v)} />
            : <input type="text" value={row.task_name ?? ''} onChange={e => onUpdate(rowIndex, 'task_name', e.target.value)}
                className={CELL_INPUT + ' focus:border-purple-400'} style={taskEmpty ? CELL_EMPTY_STYLE : CELL_STYLE} placeholder="—" />
          }
        </div>
        {dicts ? (
          <CellSelect label="Цифровая зрелость" idValue={row.digital_maturity_id} items={dicts.digital_maturities}
            onChange={(name, id) => { onUpdate(rowIndex, 'digital_maturity', name); onUpdate(rowIndex, 'digital_maturity_id', id) }} />
        ) : (
          <CellText label="Цифровая зрелость" field="digital_maturity" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
        )}
      </div>

      {/* Row 9: Описание результата (full width) */}
      <div className="px-4 py-3">
        <CellTextArea label="Описание результата" field="result_description" row={row} rowIndex={rowIndex} onUpdate={onUpdate} />
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PreviewModal({ result, guId, orgs, levelType, deptId, savedData, excelRows, onClose, onSave, onExcelRowsChange }: Props) {
  const { filename, gu_name, gu_id } = result

  const [selectedGuId, setSelectedGuId] = useState<string>(guId ?? gu_id ?? '')
  const [selectedDeptId, setSelectedDeptId] = useState<string>(deptId ?? '')
  const [localDepts, setLocalDepts] = useState<Department[]>([])
  const [orgSearch, setOrgSearch] = useState('')
  const [orgDropOpen, setOrgDropOpen] = useState(false)
  const [deptSearch, setDeptSearch] = useState('')
  const [deptDropOpen, setDeptDropOpen] = useState(false)
  const orgDropRef = useRef<HTMLDivElement>(null)
  const deptDropRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgDropRef.current && !orgDropRef.current.contains(e.target as Node)) setOrgDropOpen(false)
      if (deptDropRef.current && !deptDropRef.current.contains(e.target as Node)) setDeptDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  // Editable local copy of excel rows
  const [localExcelRows, setLocalExcelRows] = useState<ExcelFunctionRow[]>(() => excelRows ? [...excelRows] : [])
  // Whether excel was originally provided (vs user-entered metadata)
  // Per-function metadata when no Excel file is loaded (keyed by function index)
  const [fnExcelMeta, setFnExcelMeta] = useState<Record<number, ExcelFunctionRow>>({})
  // Which function indices are expanded to show excel metadata
  const [expandedFns, setExpandedFns] = useState<Set<number>>(new Set())
  const toggleFn = (i: number, fnText?: string) => {
    // Only create fnExcelMeta[i] when there is no existing localExcelRows match for this function.
    // If a match exists in localExcelRows, edits go via updateExcelField (not fnExcelMeta).
    if (!fnExcelMeta[i]) {
      const hasExcelMatch = localExcelRows.length > 0 && !!matchExcelRow(fnText ?? '', localExcelRows, i)
      if (!hasExcelMatch) {
        setFnExcelMeta(prev => ({ ...prev, [i]: createDefaultExcelRow(fnText ?? '') }))
      }
    }
    setExpandedFns(prev => {
      const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next
    })
  }

  const [dicts, setDicts] = useState<Dicts | null>(null)
  useEffect(() => {
    getDicts().then(d => {
      setDicts(d)
      // Auto-populate ID fields from text names for all rows that don't have IDs yet
      setLocalExcelRows(prev => prev.map(row => {
        const updated = { ...row }

        // Match a name against a list: exact → full contains → word overlap
        const fuzzyMatch = (items: DictItem[], name: string): DictItem | undefined => {
          if (!name) return undefined
          // Strip leading number prefix like "3 Организация..." or "01 Государственные..."
          const n = name.toLowerCase().trim().replace(/^\d+[\s.\)]+/, '')
          const norm = (s: string) => s.toLowerCase().trim().replace(/^\d+[\s.\)]+/, '')
          // 1. exact
          let m = items.find(x => norm(x.name) === n)
          if (m) return m
          // 2. one contains the other (full string, no slicing)
          m = items.find(x => {
            const xn = norm(x.name)
            return xn.includes(n) || n.includes(xn)
          })
          if (m) return m
          // 3. shared word overlap (words > 3 chars)
          const words = n.split(/\s+/).filter(w => w.length > 3)
          if (!words.length) return undefined
          let best: DictItem | undefined
          let bestScore = 0
          for (const x of items) {
            const xn = norm(x.name)
            const score = words.filter(w => xn.includes(w)).length
            if (score > bestScore) { bestScore = score; best = x }
          }
          return bestScore >= Math.max(1, Math.floor(words.length * 0.5)) ? best : undefined
        }

        if (!updated.function_type_id && updated.function_type) {
          const m = fuzzyMatch(d.function_types, updated.function_type)
          if (m) updated.function_type_id = m.id
        }
        if (!updated.digital_maturity_id && updated.digital_maturity) {
          const m = fuzzyMatch(d.digital_maturities, updated.digital_maturity)
          if (m) updated.digital_maturity_id = m.id
        }
        if (!updated.activity_area_id && updated.activity_area_name) {
          const m = fuzzyMatch(d.activity_areas, updated.activity_area_name)
          if (m) updated.activity_area_id = m.id
        }
        if (!updated.sub_activity_area_id && updated.sub_activity_area_name) {
          // Try filtered by area first, fall back to all
          const scoped = updated.activity_area_id
            ? d.sub_activity_areas.filter(x => x.area_id === updated.activity_area_id)
            : d.sub_activity_areas
          const m = fuzzyMatch(scoped.length ? scoped : d.sub_activity_areas, updated.sub_activity_area_name)
          if (m) updated.sub_activity_area_id = m.id
        }
        if (!updated.functional_group_id && updated.functional_group_name) {
          const m = fuzzyMatch(d.functional_groups, updated.functional_group_name)
          if (m) { updated.functional_group_id = m.id; updated.functional_group_name = m.name }
        }
        if (!updated.functional_subgroup_id && updated.functional_subgroup_name) {
          // Try filtered by group first, fall back to all
          const scoped = updated.functional_group_id
            ? d.functional_subgroups.filter(x => x.group_id === updated.functional_group_id)
            : d.functional_subgroups
          const m = fuzzyMatch(scoped.length ? scoped : d.functional_subgroups, updated.functional_subgroup_name)
          if (m) { updated.functional_subgroup_id = m.id; updated.functional_subgroup_name = m.name }
        }
        // Backfill group from subgroup when group match failed but subgroup was found
        if (!updated.functional_group_id && updated.functional_subgroup_id) {
          const sg = d.functional_subgroups.find(x => x.id === updated.functional_subgroup_id)
          if (sg?.group_id) {
            const grp = d.functional_groups.find(x => x.id === sg.group_id)
            if (grp) { updated.functional_group_id = grp.id; updated.functional_group_name = grp.name }
          }
        }
        // Backfill area from sub-area when area match failed but sub-area was found
        if (!updated.activity_area_id && updated.sub_activity_area_id) {
          const sa = d.sub_activity_areas.find(x => x.id === updated.sub_activity_area_id)
          if (sa?.area_id) {
            const area = d.activity_areas.find(x => x.id === sa.area_id)
            if (area) { updated.activity_area_id = area.id; updated.activity_area_name = area.name }
          }
        }

        return updated
      }))
    }).catch(() => {})
  }, [])

  const updateExcelField = (rowIndex: number, field: keyof ExcelFunctionRow, value: string | boolean | number | undefined) =>
    setLocalExcelRows(prev => {
      const next = [...prev]
      next[rowIndex] = { ...next[rowIndex], [field]: value }
      return next
    })

  const updateFnMetaField = (rowIndex: number, field: keyof ExcelFunctionRow, value: string | boolean | number | undefined) =>
    setFnExcelMeta(prev => ({
      ...prev,
      [rowIndex]: { ...prev[rowIndex], [field]: value },
    }))

  useEffect(() => {
    if (levelType !== 'otdel' || !selectedGuId) { setLocalDepts([]); return }
    getDepartments(selectedGuId).then(setLocalDepts).catch(() => setLocalDepts([]))
  }, [selectedGuId, levelType])

  // Initialise from savedData (if user re-opens a file they already edited) or original parsed data
  const [editData, setEditData] = useState<PreviewData>(() => {
    const src = savedData ?? result.data
    return {
      general_provisions:           src.general_provisions,
      tasks:                        [...src.tasks],
      authorities_rights:           [...src.authorities_rights],
      authorities_responsibilities: [...src.authorities_responsibilities],
      functions:                    [...src.functions],
      additions:                    src.additions,
      staff_numbers:                src.staff_numbers ?? 1,
    }
  })

  // Auto-match task_name from Excel against document tasks using fuzzy matching
  useEffect(() => {
    const docTasks = editData.tasks.filter(t => t.trim())
    if (!docTasks.length) return
    const fuzzyTaskMatch = (name: string): string | undefined => {
      if (!name) return undefined
      const n = name.toLowerCase().trim()
      let m = docTasks.find(t => t.toLowerCase().trim() === n)
      if (m) return m
      m = docTasks.find(t => { const tn = t.toLowerCase().trim(); return tn.includes(n) || n.includes(tn) })
      if (m) return m
      const words = n.split(/\s+/).filter(w => w.length > 3)
      if (!words.length) return undefined
      let best: string | undefined; let bestScore = 0
      for (const t of docTasks) {
        const tn = t.toLowerCase()
        const score = words.filter(w => tn.includes(w)).length
        if (score > bestScore) { bestScore = score; best = t }
      }
      return bestScore >= Math.max(1, Math.floor(words.length * 0.5)) ? best : undefined
    }
    setLocalExcelRows(prev => prev.map(row => {
      if (!row.task_name || docTasks.includes(row.task_name)) return row
      const matched = fuzzyTaskMatch(row.task_name)
      return matched ? { ...row, task_name: matched } : row
    }))
    setFnExcelMeta(prev => {
      const next = { ...prev }
      for (const key of Object.keys(prev)) {
        const row = prev[+key]
        if (!row.task_name || docTasks.includes(row.task_name)) continue
        const matched = fuzzyTaskMatch(row.task_name)
        if (matched) next[+key] = { ...row, task_name: matched }
      }
      return next
    })
  }, [editData.tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = {
    rights:           editData.authorities_rights.filter(s => s.trim()).length,
    responsibilities: editData.authorities_responsibilities.filter(s => s.trim()).length,
    tasks:            editData.tasks.filter(s => s.trim()).length,
    functions:        editData.functions.filter(s => s.trim()).length,
  }

  const effectiveGuId = selectedGuId || null
  const canSave = stats.rights > 0 && stats.responsibilities > 0

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const updateItem = (key: ListKey, idx: number, value: string) =>
    setEditData(prev => { const arr = [...prev[key]]; arr[idx] = value; return { ...prev, [key]: arr } })

  const deleteItem = (key: ListKey, idx: number) => {
    // When a task is deleted, clear task_name in any excel/meta rows that referenced it
    if (key === 'tasks') {
      const removedTask = editData.tasks[idx]
      if (removedTask?.trim()) {
        setLocalExcelRows(prev => prev.map(row =>
          row.task_name === removedTask ? { ...row, task_name: '' } : row
        ))
        setFnExcelMeta(prev => {
          const next = { ...prev }
          Object.keys(next).forEach(k => {
            const i = Number(k)
            if (next[i]?.task_name === removedTask) next[i] = { ...next[i], task_name: '' }
          })
          return next
        })
      }
    }
    setEditData(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }))
  }

  const addItem = (key: ListKey) =>
    setEditData(prev => ({ ...prev, [key]: [...prev[key], ''] }))

  const handleSave = () => {
    // Fire onExcelRowsChange BEFORE onSave — page.tsx's onSave clears editingDraftIdRef
    // synchronously, so onExcelRowsChange would see a null ref if called after.
    if (onExcelRowsChange) {
      const allRows = editData.functions.map((fnText, i) => {
        // Prefer localExcelRows match (text-based).
        if (localExcelRows.length > 0) {
          const matched = matchExcelRow(fnText, localExcelRows, i)
          if (matched) return matched
        }
        // Positional fallback — same logic as render: Excel row i → function i
        if (localExcelRows.length > i) return localExcelRows[i]
        // Fall back to manually entered meta (only when no localExcelRows at all)
        if (fnExcelMeta[i]) return fnExcelMeta[i]
        return createDefaultExcelRow(fnText)
      })
      onExcelRowsChange(allRows)
    }
    onSave(editData, selectedGuId, levelType === 'otdel' ? selectedDeptId : undefined)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex bg-gov-navy-darker/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-modal w-full flex flex-col overflow-hidden animate-modal">

        {/* Header */}
        <div className="bg-gov-navy px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gov-blue flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-white text-sm font-bold">W</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{filename}</p>
                {orgs && orgs.length > 0 ? (
                  <div className="relative mt-1" ref={orgDropRef}>
                    <button
                      type="button"
                      onClick={() => { setOrgDropOpen(v => !v); setOrgSearch('') }}
                      className="w-full flex items-center justify-between bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg px-2 py-1 text-xs text-left transition-all"
                      style={{ color: selectedGuId ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}
                    >
                      <span className="truncate">
                        {selectedGuId
                          ? (orgs.find(o => String(o.id) === selectedGuId)?.name ?? '—')
                          : (levelType === 'otdel' ? '— Управление (родитель) —' : levelType === 'dept' ? '— Департамент не выбран —' : '— Организация не выбрана —')}
                      </span>
                      <svg className="w-3 h-3 shrink-0 ml-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    {orgDropOpen && (
                      <div className="absolute z-[200] mt-1 w-full rounded-xl overflow-hidden shadow-xl"
                           style={{ background: '#0f1c2e', border: '1px solid rgba(255,255,255,0.15)', minWidth: 260 }}>
                        <div className="p-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                          <input
                            autoFocus
                            type="text"
                            value={orgSearch}
                            onChange={e => setOrgSearch(e.target.value)}
                            placeholder="Поиск организации..."
                            className="w-full px-2 py-1 rounded-lg text-xs outline-none"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.12)' }}
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto py-1">
                          {orgs
                            .filter(o => !orgSearch || o.name.toLowerCase().includes(orgSearch.toLowerCase()))
                            .map(org => (
                              <button key={org.id} type="button"
                                      onClick={() => { setSelectedGuId(String(org.id)); setOrgDropOpen(false); setOrgSearch('') }}
                                      className="w-full text-left px-3 py-1.5 text-xs transition-colors truncate"
                                      style={{ color: String(org.id) === selectedGuId ? '#60a5fa' : 'rgba(255,255,255,0.75)',
                                               background: String(org.id) === selectedGuId ? 'rgba(55,114,255,0.15)' : 'transparent' }}
                                      onMouseEnter={e => { if (String(org.id) !== selectedGuId) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                                      onMouseLeave={e => { if (String(org.id) !== selectedGuId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                                {org.name}
                              </button>
                            ))}
                          {orgs.filter(o => !orgSearch || o.name.toLowerCase().includes(orgSearch.toLowerCase())).length === 0 && (
                            <p className="px-3 py-2 text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>Ничего не найдено</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gov-navy-light/60 text-xs mt-0.5 truncate">
                    {gu_name || effectiveGuId || 'Организация не определена'}
                  </p>
                )}

                {levelType === 'otdel' && localDepts.length > 0 && (
                  <div className="relative mt-1.5" ref={deptDropRef}>
                    <button
                      type="button"
                      onClick={() => { setDeptDropOpen(v => !v); setDeptSearch('') }}
                      className="w-full flex items-center justify-between bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg px-2 py-1 text-xs text-left transition-all"
                      style={{ color: selectedDeptId ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}
                    >
                      <span className="truncate">
                        {selectedDeptId
                          ? (localDepts.find(d => String(d.id) === selectedDeptId)?.name ?? '—')
                          : '— Отдел не выбран —'}
                      </span>
                      <svg className="w-3 h-3 shrink-0 ml-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    {deptDropOpen && (
                      <div className="absolute z-[200] mt-1 w-full rounded-xl overflow-hidden shadow-xl"
                           style={{ background: '#0f1c2e', border: '1px solid rgba(255,255,255,0.15)', minWidth: 260 }}>
                        <div className="p-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                          <input
                            autoFocus
                            type="text"
                            value={deptSearch}
                            onChange={e => setDeptSearch(e.target.value)}
                            placeholder="Поиск отдела..."
                            className="w-full px-2 py-1 rounded-lg text-xs outline-none"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.12)' }}
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto py-1">
                          {localDepts
                            .filter(d => !deptSearch || d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                            .map(dept => (
                              <button key={dept.id} type="button"
                                      onClick={() => { setSelectedDeptId(String(dept.id)); setDeptDropOpen(false); setDeptSearch('') }}
                                      className="w-full text-left px-3 py-1.5 text-xs transition-colors truncate"
                                      style={{ color: String(dept.id) === selectedDeptId ? '#60a5fa' : 'rgba(255,255,255,0.75)',
                                               background: String(dept.id) === selectedDeptId ? 'rgba(55,114,255,0.15)' : 'transparent' }}
                                      onMouseEnter={e => { if (String(dept.id) !== selectedDeptId) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                                      onMouseLeave={e => { if (String(dept.id) !== selectedDeptId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                                {dept.name}
                              </button>
                            ))}
                          {localDepts.filter(d => !deptSearch || d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                            <p className="px-3 py-2 text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>Ничего не найдено</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {levelType === 'otdel' && (result.parent_position_record_id || result.existing_position_record_id) && (
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {result.parent_position_record_id && (
                      <span className="flex items-center gap-1 text-xs text-white/50">
                        <span className="text-white/30">Управление:</span>
                        <span className="font-mono text-white/70">#{result.parent_position_record_id}</span>
                      </span>
                    )}
                    {result.existing_position_record_id && (
                      <span className="flex items-center gap-1 text-xs text-amber-400/70">
                        <span className="text-white/30">Отдел уже есть:</span>
                        <span className="font-mono text-amber-400">#{result.existing_position_record_id}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                canSave
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}>
                {canSave
                  ? <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                {canSave ? 'Готов к импорту' : 'Нет прав/обязанностей'}
              </span>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mt-5">
            {[
              { label: 'Права',       value: stats.rights,           warn: stats.rights === 0 },
              { label: 'Обязанности', value: stats.responsibilities, warn: stats.responsibilities === 0 },
              { label: 'Задачи',      value: stats.tasks,            warn: false },
              { label: 'Функции',     value: stats.functions,        warn: false },
            ].map(({ label, value, warn }) => (
              <div key={label} className="bg-white/10 rounded-xl px-4 py-3 text-center">
                <p className={`text-2xl font-bold leading-none ${warn ? 'text-red-400' : 'text-white'}`}>{value}</p>
                <p className="text-gov-navy-light/50 text-[11px] mt-1 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* General provisions */}
          <div className="px-6 py-4 border-b border-gov-grey-light bg-[#fafbfd]">
            <p className="text-[11px] font-semibold text-gov-navy/40 uppercase tracking-wider mb-2">Общие положения</p>
            <AutoResizeTextarea
              value={editData.general_provisions}
              onChange={v => setEditData(prev => ({ ...prev, general_provisions: v }))}
              className="w-full text-sm text-gov-navy/80 leading-relaxed rounded-lg border border-gov-grey-light hover:border-gov-blue/40 focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/10 outline-none px-3 py-2 bg-white transition-all"
            />
          </div>

          {/* Editable sections */}
          <div className="px-6 py-5 space-y-4">
            {SECTION_CONFIG.map(({ key, label, accent, bg, text }) => {
              const items = editData[key]
              const count = items.filter(s => s.trim()).length
              return (
                <div key={key} className="rounded-xl border overflow-hidden" style={{ borderColor: accent + '30' }}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ backgroundColor: bg, borderColor: accent + '30' }}>
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: text }}>{label}</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: accent + '20', color: accent }}>{count}</span>
                  </div>

                  <div className="bg-white divide-y divide-gov-grey-light">
                    {items.map((item, i) => {
                      let excelRowMatch = key === 'functions' && localExcelRows.length > 0 ? matchExcelRow(item, localExcelRows, i) : undefined
                      // Positional fallback: if text matching failed but Excel has a row at this index, use it
                      // (operators typically fill Excel in the same order as the Положение functions)
                      if (!excelRowMatch && key === 'functions' && i < localExcelRows.length) {
                        excelRowMatch = localExcelRows[i]
                      }
                      const excelRowIdx = excelRowMatch ? localExcelRows.indexOf(excelRowMatch) : -1
                      const excelRow = excelRowIdx >= 0 ? localExcelRows[excelRowIdx] : undefined
                      // When no Excel file loaded, use per-function metadata
                      // Always available as fallback for functions with no matched excel row
                      const metaRow = key === 'functions' ? fnExcelMeta[i] : undefined
                      const showExpandToggle = key === 'functions'
                      const panelRow = excelRow ?? metaRow
                      const isExpanded = expandedFns.has(i)
                      const missingFields = (showExpandToggle && panelRow) ? getMissingFnFields(panelRow) : []
                      const missingCount = missingFields.length
                      return (
                      <div key={i} className="group">
                        <div className="flex items-start gap-3 px-4 py-2">
                          <div className="shrink-0 flex flex-col items-center gap-0.5 mt-2">
                            <span
                              className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                              style={{ backgroundColor: missingCount > 0 ? 'rgba(251,191,36,0.2)' : accent + '15', color: missingCount > 0 ? '#b45309' : accent }}
                            >{i + 1}</span>
                            {missingCount > 0 && (
                              <span className="text-[8px] font-bold leading-none" style={{ color: '#b45309' }} title={`${missingCount} полей не заполнено`}>
                                -{missingCount}
                              </span>
                            )}
                          </div>
                          <AutoResizeTextarea
                            value={item}
                            onChange={v => updateItem(key, i, v)}
                            className="flex-1 text-sm text-gov-navy/80 leading-relaxed rounded-md border border-transparent hover:border-gov-grey-light focus:border-gov-blue focus:ring-1 focus:ring-gov-blue/10 outline-none px-2 py-1.5 bg-transparent focus:bg-white transition-all"
                          />
                          {/* Expand toggle — shown for all functions (matched excel OR no excel loaded) */}
                          {showExpandToggle && (
                            <button
                              onClick={() => toggleFn(i, item)}
                              title={isExpanded ? 'Свернуть детали' : missingCount > 0 ? `Заполнить поля (${missingCount} пусто)` : excelRow ? 'Показать детали Excel' : 'Заполнить поля функции'}
                              className="shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all mt-2"
                              style={{
                                color: isExpanded ? '#7c3aed' : missingCount > 0 ? '#d97706' : '#a78bfa',
                                background: isExpanded ? '#ede9fe' : missingCount > 0 ? 'rgba(251,191,36,0.15)' : 'transparent',
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                {isExpanded
                                  ? <path d="M18 15l-6-6-6 6"/>
                                  : <path d="M6 9l6 6 6-6"/>}
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => deleteItem(key, i)}
                            className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-gov-navy/25 hover:text-red-500 hover:bg-red-50 transition-all mt-2"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                        {/* Missing fields row — shown when collapsed and fields are incomplete */}
                        {showExpandToggle && !isExpanded && missingFields.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap px-4 pb-2 ml-8">
                            {missingFields.map(label => (
                              <span key={label} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(251,191,36,0.15)', color: '#b45309', border: '1px solid rgba(251,191,36,0.3)' }}>
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Editable metadata panel — excel-matched or user-entered defaults */}
                        {showExpandToggle && isExpanded && panelRow && (
                          <ExcelMetaPanel
                            row={panelRow}
                            rowIndex={excelRow ? excelRowIdx : i}
                            dicts={dicts}
                            tasks={editData.tasks}
                            onUpdate={excelRow ? updateExcelField : updateFnMetaField}
                          />
                        )}
                      </div>
                    )})}


                    <button
                      onClick={() => addItem(key)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors hover:opacity-80"
                      style={{ color: accent }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <span>Добавить пункт</span>
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Additions */}
            <div className="rounded-xl border border-gov-grey-light overflow-hidden">
              <div className="px-4 py-2.5 bg-[#f8f9fc] border-b border-gov-grey-light">
                <span className="text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Дополнения</span>
              </div>
              <div className="bg-white p-3">
                <AutoResizeTextarea
                  value={editData.additions}
                  onChange={v => setEditData(prev => ({ ...prev, additions: v }))}
                  placeholder="Нет дополнений"
                  className="w-full text-sm text-gov-navy/80 leading-relaxed rounded-lg border border-transparent hover:border-gov-grey-light focus:border-gov-blue focus:ring-1 focus:ring-gov-blue/10 outline-none px-2 py-1.5 transition-all"
                />
              </div>
            </div>

            {/* Staff numbers */}
            <div className="rounded-xl border border-gov-grey-light overflow-hidden">
              <div className="px-4 py-2.5 bg-[#f8f9fc] border-b border-gov-grey-light">
                <span className="text-[11px] font-semibold text-gov-navy/50 uppercase tracking-wider">Штатная численность</span>
              </div>
              <div className="bg-white p-3 flex items-center gap-3">
                <label className="text-xs text-gov-navy/60 shrink-0">Штатная численность *</label>
                <input
                  type="number"
                  min={1}
                  value={editData.staff_numbers ?? 1}
                  onChange={e => setEditData(prev => ({ ...prev, staff_numbers: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-24 text-sm text-gov-navy/80 rounded-lg border border-gov-grey-light hover:border-gov-blue/40 focus:border-gov-blue focus:ring-2 focus:ring-gov-blue/10 outline-none px-3 py-1.5 transition-all"
                />
              </div>
            </div>
          </div>

        </div>{/* end scrollable body */}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gov-grey-light bg-[#f8f9fc]">
          <p className="text-xs text-gov-navy/40">
            {!effectiveGuId
              ? <span className="text-amber-500 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Организация не определена — выберите в выпадающем списке выше
                </span>
              : levelType === 'otdel' && !selectedDeptId
                ? <span className="text-amber-500 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Отдел не выбран — выберите в выпадающем списке выше
                  </span>
                : 'Отредактируйте данные и нажмите «Сохранить»'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gov-navy/70 hover:text-gov-navy border border-gov-grey-light hover:border-gov-grey-light-hover bg-white rounded-xl transition-all"
            >Закрыть</button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-gov-blue hover:bg-gov-blue-hover active:bg-gov-blue-active rounded-xl transition-all"
            >
              Сохранить
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
