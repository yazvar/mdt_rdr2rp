import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { can, useAuth } from './auth'
import { Field } from './ui'

export interface CitizenBrief { id: string; firstName: string; lastName: string; alias: string }
export interface CitizenCard extends CitizenBrief {
  occupation: string
  residence: string
  marks: string
  notes: string
  photoData: string
  version: number
  archivedAt: string | null
}

export function Portrait(props: { photo?: string; name: string }) {
  const letters = props.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  return (
    <div className="portrait" aria-hidden="true">
      <div className="portrait-inner">
        {props.photo ? <img src={props.photo} alt="" /> : <span>{letters || '—'}</span>}
      </div>
    </div>
  )
}

export function CitizenSelect(props: { value: string; picked: string; onChange: (id: string) => void }) {
  const auth = useAuth()
  const enabled = can(auth.user, 'citizens.view')
  const [q, setQ] = useState('')
  const list = useQuery({
    queryKey: ['citizens', 'pick', q],
    enabled,
    queryFn: () => api<{ items: CitizenBrief[] }>(`/api/citizens?pageSize=20&q=${encodeURIComponent(q)}`),
  })
  if (!enabled) return null
  const items = list.data?.items ?? []
  const missing = props.value && !items.some((item) => item.id === props.value)
  return (
    <Field label="Гражданин из картотеки" wide>
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Найти по имени или фамилии" />
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">Нет в картотеке — вписать вручную</option>
        {missing && <option value={props.value}>{props.picked}</option>}
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.lastName} {item.firstName}{item.alias ? ` · ${item.alias}` : ''}</option>
        ))}
      </select>
    </Field>
  )
}
