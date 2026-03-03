'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Org, PreviewResult, PreviewData } from '@/lib/api'

interface Props {
  result: PreviewResult
  guId?: string
  orgs?: Org[]
  savedData?: PreviewData       // previously saved edits, if any
  onClose: () => void
  onSave: (data: PreviewData, guId: string) => void
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

const SECTION_CONFIG = [
  { key: 'tasks' as const,                        label: 'Задачи',                  count_key: 'tasks',            accent: '#3772ff', bg: '#ebf1ff', text: '#2956bf' },
  { key: 'authorities_rights' as const,           label: 'Полномочия (права)',       count_key: 'rights',           accent: '#059669', bg: '#ecfdf5', text: '#065f46' },
  { key: 'authorities_responsibilities' as const,  label: 'Полномочия (обязанности)', count_key: 'responsibilities', accent: '#d97706', bg: '#fffbeb', text: '#92400e' },
  { key: 'functions' as const,                    label: 'Функции',                 count_key: 'functions',        accent: '#7c3aed', bg: '#f5f3ff', text: '#5b21b6' },
]

type ListKey = 'tasks' | 'authorities_rights' | 'authorities_responsibilities' | 'functions'

export default function PreviewModal({ result, guId, orgs, savedData, onClose, onSave }: Props) {
  const { filename, gu_name, gu_id } = result

  const [selectedGuId, setSelectedGuId] = useState<string>(guId ?? gu_id ?? '')

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
    }
  })

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

  const deleteItem = (key: ListKey, idx: number) =>
    setEditData(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }))

  const addItem = (key: ListKey) =>
    setEditData(prev => ({ ...prev, [key]: [...prev[key], ''] }))

  const handleSave = () => {
    onSave(editData, selectedGuId)
    onClose()
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
                  <select
                    value={selectedGuId}
                    onChange={e => setSelectedGuId(e.target.value)}
                    className="mt-1 w-full bg-white/10 hover:bg-white/15 border border-white/20 focus:border-white/40 outline-none rounded-lg px-2 py-1 text-xs text-white/80 focus:text-white transition-all appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-gov-navy text-white">— Организация не выбрана —</option>
                    {orgs.map(org => (
                      <option key={org.id} value={String(org.id)} className="bg-gov-navy text-white">
                        {org.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-gov-navy-light/60 text-xs mt-0.5 truncate">
                    {gu_name || effectiveGuId || 'Организация не определена'}
                  </p>
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
                    {items.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-2 group">
                        <span
                          className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold mt-2"
                          style={{ backgroundColor: accent + '15', color: accent }}
                        >{i + 1}</span>
                        <AutoResizeTextarea
                          value={item}
                          onChange={v => updateItem(key, i, v)}
                          className="flex-1 text-sm text-gov-navy/80 leading-relaxed rounded-md border border-transparent hover:border-gov-grey-light focus:border-gov-blue focus:ring-1 focus:ring-gov-blue/10 outline-none px-2 py-1.5 bg-transparent focus:bg-white transition-all"
                        />
                        <button
                          onClick={() => deleteItem(key, i)}
                          className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-gov-navy/25 hover:text-red-500 hover:bg-red-50 transition-all mt-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}

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
              : 'Отредактируйте данные и нажмите «Сохранить»'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gov-navy/70 hover:text-gov-navy border border-gov-grey-light hover:border-gov-grey-light-hover bg-white rounded-xl transition-all"
            >Закрыть</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-gov-blue hover:bg-gov-blue-hover active:bg-gov-blue-active disabled:bg-gov-blue/30 disabled:cursor-not-allowed rounded-xl transition-all"
            >
              Сохранить
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
