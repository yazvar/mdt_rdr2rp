import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { when } from '../format'
import { Button, CopyButton, Empty, Field, Modal, Pager, Status, useToast } from '../ui'

interface RequestRow { id: string; requestNumber: string; requesterName: string; badgeNumber: string; itemName: string; quantity: number; reason: string; comment: string; status: string; reviewComment: string; version: number; createdAt: string; inventoryItemId: string | null }

export function RequestsPage() {
  const auth = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const review = can(auth.user, 'requests.review')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<RequestRow | null>(null)
  const [form, setForm] = useState({ itemName: '', inventoryItemId: '', quantity: 1, reason: '', comment: '' })
  const [comment, setComment] = useState('')
  const list = useQuery({ queryKey: ['requests', page, status], queryFn: () => api<{ items: RequestRow[]; total: number; pageSize: number }>(`/api/requests?page=${page}&status=${status}`) })
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<{ items: { id: string; name: string; quantityOnHand: number }[] }>('/api/armory/catalog') })
  const create = useMutation({
    mutationFn: () => api('/api/requests', { method: 'POST', body: JSON.stringify({ ...form, inventoryItemId: form.inventoryItemId || null }) }),
    onSuccess: async () => { toast.success('Запрос отправлен шерифу.'); setOpen(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  function decide(decision: 'approved' | 'rejected' | 'closed') {
    if (!current) return
    if (decision === 'rejected' && comment.trim().length < 3) {
      toast.error('Укажите причину отклонения, не короче трёх символов.')
      return
    }
    api(`/api/requests/${current.id}/review`, { method: 'POST', body: JSON.stringify({ version: current.version, decision, comment, inventoryItemId: current.inventoryItemId }) })
      .then(async () => { toast.success('Решение записано.'); setCurrent(null); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Снабжение</p><h1>Запросы снаряжения</h1></div>{can(auth.user, 'requests.create') && <Button onClick={() => setOpen(true)}>Новый запрос</Button>}</div>
      <div className="filters"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все</option><option value="pending">Ожидают</option><option value="approved">Одобрены</option><option value="rejected">Отклонены</option><option value="issued">Выданы</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>Номер</th><th>Сотрудник</th><th>Предмет</th><th>Кол-во</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
        {list.data?.items.map((item) => <tr key={item.id} className="clickable" onClick={() => { setCurrent(item); setComment('') }}><td>{item.requestNumber}</td><td>{item.requesterName}<div className="muted">{item.badgeNumber}</div></td><td>{item.itemName}</td><td>{item.quantity}</td><td><Status code={item.status} /></td><td>{when(item.createdAt)}</td></tr>)}
      </tbody></table>{!list.data?.items.length && <Empty text="Запросов нет." />}</div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {open && <Modal title="Запрос" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
        <Field label="Со склада" wide><select value={form.inventoryItemId} onChange={(event) => { const item = catalog.data?.items.find((row) => row.id === event.target.value); setForm({ ...form, inventoryItemId: event.target.value, itemName: item?.name ?? form.itemName }) }}><option value="">Своё название</option>{catalog.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.quantityOnHand}</option>)}</select></Field>
        <Field label="Предмет" wide><input value={form.itemName} onChange={(event) => setForm({ ...form, itemName: event.target.value })} required /></Field>
        <Field label="Количество"><input type="number" min={1} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></Field>
        <Field label="Причина" wide><textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></Field>
        <Field label="Комментарий" wide><textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} /></Field>
        <div className="wide"><Button disabled={!auth.online || create.isPending}>Отправить</Button></div>
      </form></Modal>}
      {current && <Modal title={current.requestNumber} onClose={() => setCurrent(null)}>
        <CopyButton value={current.requestNumber} /> <Status code={current.status} />
        <p>{current.requesterName}, табельный {current.badgeNumber}</p>
        <p>{current.itemName} × {current.quantity}</p>
        <p>{current.reason}</p>
        {current.reviewComment && <p>Решение: {current.reviewComment}</p>}
        {review && current.status === 'pending' && <div className="stack"><Field label="Комментарий"><textarea value={comment} onChange={(event) => setComment(event.target.value)} /></Field><div className="row"><Button onClick={() => decide('approved')}>Одобрить</Button><Button danger onClick={() => decide('rejected')}>Отклонить</Button></div></div>}
        {review && current.status === 'approved' && <Button onClick={() => {
          const itemId = current.inventoryItemId
          if (!itemId) { toast.error('У запроса нет предмета склада. Одобрите его с выбранной карточкой склада.'); return }
          api(`/api/requests/${current.id}/issue`, { method: 'POST', body: JSON.stringify({ version: current.version, inventoryItemId: itemId, notes: 'Выдача по запросу' }) })
            .then(async () => { toast.success('Снаряжение выдано, склад обновлён.'); setCurrent(null); await queryClient.invalidateQueries() })
            .catch((error: Error) => toast.error(error.message))
        }}>Выдать со склада</Button>}
      </Modal>}
    </div>
  )
}
