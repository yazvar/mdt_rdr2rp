import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { totalsError } from '@mdt/shared'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { CitizenSelect } from '../citizenPick'
import { money, when } from '../format'
import { ChargeChoice, PunishmentPicker, type ChargeLaw } from '../sentence'
import { Button, CopyButton, Empty, Field, Modal, Pager, Status, useConfirm, useToast } from '../ui'

interface Notice { id: string; caseNumber: string; firstName: string; lastName: string; postedAt: string; grounds: string; description: string; wantedLevel: number; fineCents: number; jailDays: number; status: string; version: number; charges?: { articleNumber: string; title: string }[]; fines?: { id: string; fineNumber: string; amountCents: number; paymentStatus: string }[] }

export function WantedPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const write = can(auth.user, 'wanted.create')
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ citizenId: '', firstName: '', lastName: '', grounds: '', description: '', wantedLevel: 1, charges: [] as ChargeChoice[], evidence: '', photoData: '' })
  const open = params.get('open')
  const list = useQuery({ queryKey: ['wanted', page, q, status, level], queryFn: () => api<{ items: Notice[]; total: number; pageSize: number }>(`/api/wanted?page=${page}&q=${encodeURIComponent(q)}&status=${status}&level=${level}`) })
  const detail = useQuery({ queryKey: ['wanted-one', open], enabled: Boolean(open), queryFn: () => api<Notice>(`/api/wanted/${open}`) })
  const laws = useQuery({ queryKey: ['laws', 'pick'], queryFn: () => api<{ items: ChargeLaw[] }>('/api/laws?pageSize=100&status=active') })
  const save = useMutation({
    mutationFn: () => api('/api/wanted', { method: 'POST', body: JSON.stringify({ ...form, citizenId: form.citizenId || null }) }),
    onSuccess: async () => { toast.success('Розыск объявлен.'); setCreating(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  async function close(next: string) {
    if (!detail.data) return
    const answer = await confirm({ title: next === 'cancelled' ? 'Отменить розыск' : 'Закрыть розыск', body: 'Укажите причину. Она останется в деле.', reason: true })
    if (!answer.ok) return
    api(`/api/wanted/${detail.data.id}`, { method: 'PATCH', body: JSON.stringify({ version: detail.data.version, status: next, closeReason: answer.reason, reason: answer.reason }) })
      .then(async () => { toast.success('Статус розыска изменён.'); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Розыскные листы</p><h1>Розыск</h1></div>{write && <Button onClick={() => setCreating(true)}>Объявить розыск</Button>}</div>
      <div className="filters">
        <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Имя или фамилия" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все статусы</option><option value="active">Активный</option><option value="detained">Задержан</option><option value="closed">Закрыт</option><option value="cancelled">Отменён</option></select>
        <select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Любой уровень</option>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Дело</th><th>Персонаж</th><th>Уровень</th><th>Штраф</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
        {list.data?.items.map((item) => <tr key={item.id} className="clickable" onClick={() => setParams({ open: item.id })}><td>{item.caseNumber}</td><td>{item.lastName} {item.firstName}</td><td>{item.wantedLevel}</td><td>{money(item.fineCents, auth.department?.currencySymbol)}</td><td><Status code={item.status} /></td><td>{when(item.postedAt)}</td></tr>)}
      </tbody></table>{!list.data?.items.length && <Empty text="Розыскных карточек нет." />}</div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {creating && <Modal title="Новый розыск" onClose={() => setCreating(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <CitizenSelect value={form.citizenId} picked={`${form.lastName} ${form.firstName}`} onChange={(id) => {
          if (!id) { setForm({ ...form, citizenId: '' }); return }
          api<{ firstName: string; lastName: string; photoData: string }>(`/api/citizens/${id}`)
            .then((person) => setForm((current) => ({ ...current, citizenId: id, firstName: person.firstName, lastName: person.lastName, photoData: person.photoData || current.photoData })))
            .catch((error: Error) => toast.error(error.message))
        }} />
        <Field label="Имя"><input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required readOnly={Boolean(form.citizenId)} /></Field>
        <Field label="Фамилия"><input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required readOnly={Boolean(form.citizenId)} /></Field>
        <Field label="Уровень"><input type="number" min={1} max={5} value={form.wantedLevel} onChange={(event) => setForm({ ...form, wantedLevel: Number(event.target.value) })} /></Field>
        <Field label="Основание" wide><textarea value={form.grounds} onChange={(event) => setForm({ ...form, grounds: event.target.value })} required /></Field>
        <Field label="Описание" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <PunishmentPicker laws={laws.data?.items ?? []} value={form.charges} symbol={auth.department?.currencySymbol} onChange={(charges) => setForm({ ...form, charges })} />
        <div className="wide"><Button disabled={!auth.online || save.isPending || Boolean(totalsError(form.charges.reduce((sum, item) => sum + item.fineCents, 0), form.charges.reduce((sum, item) => sum + item.jailDays, 0)))}>Объявить</Button></div>
      </form></Modal>}
      {detail.data && <Modal title={`${detail.data.lastName} ${detail.data.firstName}`} onClose={() => setParams({})}>
        <CopyButton value={detail.data.caseNumber} /> <Status code={detail.data.status} />
        <p>{detail.data.grounds}</p>
        <p>Уровень {detail.data.wantedLevel}. Штраф {money(detail.data.fineCents, auth.department?.currencySymbol)}. Срок: {detail.data.jailDays}.</p>
        <div>{detail.data.charges?.map((charge) => <div key={charge.articleNumber}>{charge.articleNumber} — {charge.title}</div>)}</div>
        <h3>Связанные штрафы</h3>
        {detail.data.fines?.map((fine) => <div key={fine.id}>{fine.fineNumber} · {money(fine.amountCents, auth.department?.currencySymbol)} <Status code={fine.paymentStatus} /></div>)}
        {!detail.data.fines?.length && <div className="muted">Штрафы к этой карточке не привязаны.</div>}
        {write && detail.data.status === 'active' && <div className="row" style={{ marginTop: 12 }}><Button onClick={() => close('detained')}>Задержан</Button><Button onClick={() => close('closed')}>Закрыть</Button><Button danger onClick={() => close('cancelled')}>Отменить</Button></div>}
      </Modal>}
    </div>
  )
}
