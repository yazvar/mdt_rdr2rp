import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { Portrait } from '../citizenPick'
import { Button, Empty, Field, Modal, Pager, useConfirm, useToast } from '../ui'

interface Row {
  id: string
  firstName: string
  lastName: string
  alias: string
  occupation: string
  residence: string
  hasPhoto: boolean
  archivedAt: string | null
}

interface Card extends Row {
  marks: string
  notes: string
  photoData: string
  version: number
}

const empty = { firstName: '', lastName: '', alias: '', occupation: '', residence: '', marks: '', notes: '', photoData: '' }

export function CitizensPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const write = can(auth.user, 'citizens.manage')
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [draft, setDraft] = useState<typeof empty | null>(null)
  const [editing, setEditing] = useState<Card | null>(null)
  const open = params.get('open')
  const list = useQuery({
    queryKey: ['citizens', page, q, archived],
    queryFn: () => api<{ items: Row[]; total: number; pageSize: number }>(`/api/citizens?page=${page}&q=${encodeURIComponent(q)}&status=${archived ? 'archived' : ''}`),
  })
  const detail = useQuery({ queryKey: ['citizen', open], enabled: Boolean(open), queryFn: () => api<Card>(`/api/citizens/${open}`) })
  const save = useMutation({
    mutationFn: () => {
      if (!draft) return Promise.resolve()
      if (editing) {
        return api(`/api/citizens/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ ...draft, version: editing.version }) })
      }
      return api('/api/citizens', { method: 'POST', body: JSON.stringify(draft) })
    },
    onSuccess: async () => {
      toast.success(editing ? 'Карточка обновлена.' : 'Гражданин внесён в картотеку.')
      setDraft(null)
      setEditing(null)
      await queryClient.invalidateQueries()
    },
    onError: (error: Error) => toast.error(error.message),
  })
  function readPhoto(file: File | undefined) {
    if (!file || !draft) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Нужна фотография PNG, JPEG или WebP.')
      return
    }
    if (file.size > 380_000) {
      toast.error('Фотография слишком большая.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setDraft({ ...draft, photoData: String(reader.result || '') })
    reader.readAsDataURL(file)
  }
  async function archive(card: Card) {
    const answer = await confirm({
      title: card.archivedAt ? 'Вернуть в картотеку' : 'Убрать в архив',
      body: 'Запись не удаляется. Причина останется в журнале.',
      reason: true,
    })
    if (!answer.ok) return
    api(`/api/citizens/${card.id}/archive`, { method: 'POST', body: JSON.stringify({ reason: answer.reason, version: card.version }) })
      .then(async () => { toast.success(card.archivedAt ? 'Гражданин снова в картотеке.' : 'Карточка убрана в архив.'); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  const shown = draft ?? empty
  return (
    <div>
      <div className="page-head">
        <div><p className="kicker">Картотека</p><h1>Граждане</h1></div>
        {write && <Button onClick={() => { setEditing(null); setDraft({ ...empty }) }}>Новый гражданин</Button>}
      </div>
      <div className="filters">
        <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Имя, фамилия, прозвище" />
        <Button type="button" ghost={!archived} onClick={() => { setArchived((value) => !value); setPage(1) }}>{archived ? 'Показан архив' : 'Показать архив'}</Button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Фамилия</th><th>Имя</th><th>Прозвище</th><th>Занятие</th><th>Где живёт</th><th>Фото</th></tr></thead>
          <tbody>
            {list.data?.items.map((item) => (
              <tr key={item.id} className="clickable" onClick={() => setParams({ open: item.id })}>
                <td>{item.lastName}</td>
                <td>{item.firstName}</td>
                <td>{item.alias || '—'}</td>
                <td>{item.occupation || '—'}</td>
                <td>{item.residence || '—'}</td>
                <td>{item.hasPhoto ? 'есть' : 'нет'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.items.length && <Empty text={archived ? 'В архиве пусто.' : 'Граждан пока нет. Внесите имя и фамилию.'} />}
      </div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {draft && (
        <Modal title={editing ? 'Карточка гражданина' : 'Новый гражданин'} onClose={() => { setDraft(null); setEditing(null) }}>
          <form className="citizen-form" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
            <div className="portrait-wrap">
              <Portrait photo={shown.photoData} name={`${shown.firstName} ${shown.lastName}`} />
              <label className="portrait-file">
                Фотография
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => readPhoto(event.target.files?.[0])} />
              </label>
              {shown.photoData && <Button type="button" ghost onClick={() => setDraft({ ...shown, photoData: '' })}>Убрать фото</Button>}
            </div>
            <div className="form-grid">
              <Field label="Имя"><input value={shown.firstName} onChange={(event) => setDraft({ ...shown, firstName: event.target.value })} required /></Field>
              <Field label="Фамилия"><input value={shown.lastName} onChange={(event) => setDraft({ ...shown, lastName: event.target.value })} required /></Field>
              <Field label="Прозвище"><input value={shown.alias} onChange={(event) => setDraft({ ...shown, alias: event.target.value })} /></Field>
              <Field label="Занятие"><input value={shown.occupation} onChange={(event) => setDraft({ ...shown, occupation: event.target.value })} /></Field>
              <Field label="Где живёт" wide><input value={shown.residence} onChange={(event) => setDraft({ ...shown, residence: event.target.value })} /></Field>
              <Field label="Приметы" wide><textarea value={shown.marks} onChange={(event) => setDraft({ ...shown, marks: event.target.value })} /></Field>
              <Field label="Заметки" wide><textarea value={shown.notes} onChange={(event) => setDraft({ ...shown, notes: event.target.value })} /></Field>
              <div className="wide"><Button disabled={!auth.online || save.isPending}>Сохранить</Button></div>
            </div>
          </form>
        </Modal>
      )}
      {detail.data && !draft && (
        <Modal title={`${detail.data.lastName} ${detail.data.firstName}`} onClose={() => setParams({})}>
          <div className="citizen-view">
            <Portrait photo={detail.data.photoData} name={`${detail.data.firstName} ${detail.data.lastName}`} />
            <div>
              {detail.data.alias && <p>Прозвище: {detail.data.alias}</p>}
              {detail.data.occupation && <p>Занятие: {detail.data.occupation}</p>}
              {detail.data.residence && <p>Где живёт: {detail.data.residence}</p>}
              {detail.data.marks && <p>Приметы: {detail.data.marks}</p>}
              {detail.data.notes && <p>{detail.data.notes}</p>}
              {!detail.data.alias && !detail.data.occupation && !detail.data.residence && !detail.data.marks && !detail.data.notes && <p className="muted">Кроме имени, в карточке пока ничего нет.</p>}
              {write && (
                <div className="row" style={{ marginTop: 12 }}>
                  <Button onClick={() => { setEditing(detail.data); setDraft({ firstName: detail.data.firstName, lastName: detail.data.lastName, alias: detail.data.alias, occupation: detail.data.occupation, residence: detail.data.residence, marks: detail.data.marks, notes: detail.data.notes, photoData: detail.data.photoData }) }}>Изменить</Button>
                  <Button ghost onClick={() => archive(detail.data)}>{detail.data.archivedAt ? 'Вернуть' : 'В архив'}</Button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
