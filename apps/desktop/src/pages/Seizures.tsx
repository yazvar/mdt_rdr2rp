import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { CitizenSelect } from '../citizenPick'
import { fromLocalInput, toLocalInput, when } from '../format'
import { Button, CopyButton, Empty, Field, Modal, Pager, Status, useConfirm, useToast } from '../ui'

interface Item { name: string; quantity: number; notes: string }
interface Seizure { id: string; caseNumber: string; suspectFirstName: string; suspectLastName: string; seizedAt: string; grounds: string; officerName: string; location: string; propertyStatus: string; notes: string; version: number; items: Item[] }

const blank = { citizenId: '', suspectFirstName: '', suspectLastName: '', seizedAt: toLocalInput(new Date().toISOString()), grounds: '', location: '', notes: '', items: [{ name: '', quantity: 1, notes: '' }] as Item[] }

export function SeizuresPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const manage = can(auth.user, 'seizure.manage')
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(blank)
  const open = params.get('open')
  const list = useQuery({ queryKey: ['seizures', page, q], queryFn: () => api<{ items: Seizure[]; total: number; pageSize: number }>(`/api/seizures?page=${page}&q=${encodeURIComponent(q)}`) })
  const detail = useQuery({ queryKey: ['seizure', open], enabled: Boolean(open), queryFn: () => api<Seizure>(`/api/seizures/${open}`) })
  const save = useMutation({
    mutationFn: () => api('/api/seizures', { method: 'POST', body: JSON.stringify({ ...form, citizenId: form.citizenId || null, seizedAt: fromLocalInput(form.seizedAt), items: form.items.filter((item) => item.name) }) }),
    onSuccess: async () => { toast.success('Конфискация записана.'); setCreating(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  async function setStatus(status: string) {
    if (!detail.data) return
    const answer = await confirm({ title: 'Статус имущества', body: 'Изменение попадёт в историю дела.', reason: true })
    if (!answer.ok) return
    api(`/api/seizures/${detail.data.id}`, { method: 'PATCH', body: JSON.stringify({ version: detail.data.version, reason: answer.reason, propertyStatus: status }) })
      .then(async () => { toast.success('Статус обновлён.'); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Имущество</p><h1>Конфискат</h1></div>{manage && <Button onClick={() => { setForm(blank); setCreating(true) }}>Новая запись</Button>}</div>
      <div className="filters"><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Имя, дело, сотрудник" /></div>
      <div className="table-wrap"><table><thead><tr><th>Дело</th><th>Владелец</th><th>Предметы</th><th>Сотрудник</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
        {list.data?.items.map((item) => <tr key={item.id} className="clickable" onClick={() => setParams({ open: item.id })}><td>{item.caseNumber}</td><td>{item.suspectLastName} {item.suspectFirstName}</td><td>{item.items.map((piece) => `${piece.name} × ${piece.quantity}`).join(', ')}</td><td>{item.officerName}</td><td><Status code={item.propertyStatus} /></td><td>{when(item.seizedAt)}</td></tr>)}
      </tbody></table>{!list.data?.items.length && <Empty text="Конфискаций нет." />}</div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {creating && <Modal title="Конфискация" onClose={() => setCreating(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <CitizenSelect value={form.citizenId} picked={`${form.suspectLastName} ${form.suspectFirstName}`} onChange={(id) => {
          if (!id) { setForm({ ...form, citizenId: '' }); return }
          api<{ firstName: string; lastName: string }>(`/api/citizens/${id}`)
            .then((person) => setForm((current) => ({ ...current, citizenId: id, suspectFirstName: person.firstName, suspectLastName: person.lastName })))
            .catch((error: Error) => toast.error(error.message))
        }} />
        <Field label="Имя"><input value={form.suspectFirstName} onChange={(event) => setForm({ ...form, suspectFirstName: event.target.value })} required readOnly={Boolean(form.citizenId)} /></Field>
        <Field label="Фамилия"><input value={form.suspectLastName} onChange={(event) => setForm({ ...form, suspectLastName: event.target.value })} required readOnly={Boolean(form.citizenId)} /></Field>
        <Field label="Дата"><input type="datetime-local" value={form.seizedAt} onChange={(event) => setForm({ ...form, seizedAt: event.target.value })} required /></Field>
        <Field label="Место"><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
        <Field label="Основание" wide><textarea value={form.grounds} onChange={(event) => setForm({ ...form, grounds: event.target.value })} required /></Field>
        {form.items.map((item, index) => <div className="row wide" key={index}><input placeholder="Предмет" value={item.name} onChange={(event) => setForm({ ...form, items: form.items.map((piece, i) => i === index ? { ...piece, name: event.target.value } : piece) })} /><input type="number" min={1} value={item.quantity} onChange={(event) => setForm({ ...form, items: form.items.map((piece, i) => i === index ? { ...piece, quantity: Number(event.target.value) } : piece) })} /></div>)}
        <Button ghost type="button" onClick={() => setForm({ ...form, items: [...form.items, { name: '', quantity: 1, notes: '' }] })}>Ещё предмет</Button>
        <div className="wide"><Button disabled={!auth.online || save.isPending}>Сохранить</Button></div>
      </form></Modal>}
      {detail.data && <Modal title={detail.data.caseNumber} onClose={() => setParams({})}><CopyButton value={detail.data.caseNumber} /><p>{detail.data.grounds}</p><p>{detail.data.location}</p><Status code={detail.data.propertyStatus} />{manage && <div className="row" style={{ marginTop: 12 }}><Button onClick={() => setStatus('returned')}>Вернуть</Button><Button onClick={() => setStatus('stored')}>На хранение</Button><Button danger onClick={() => setStatus('written_off')}>Списать</Button></div>}</Modal>}
    </div>
  )
}
