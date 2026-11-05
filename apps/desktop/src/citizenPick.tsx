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

export function fitPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Нужен файл изображения.'))
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const maxWidth = 480
      const maxHeight = 640
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error('Не удалось подготовить фотографию.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      let quality = 0.86
      let data = canvas.toDataURL('image/jpeg', quality)
      while (data.length > 500_000 && quality > 0.45) {
        quality -= 0.08
        data = canvas.toDataURL('image/jpeg', quality)
      }
      URL.revokeObjectURL(url)
      if (data.length > 550_000) reject(new Error('Фотография слишком большая даже после уменьшения.'))
      else resolve(data)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Этот файл не открывается. Выберите JPEG или PNG либо вставьте ссылку.'))
    }
    image.src = url
  })
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
