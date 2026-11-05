import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { fromLocalInput, toLocalInput, when } from '../format'
import { Button, CopyButton, Empty, Field, Modal, Pager, Status, useConfirm, useToast } from '../ui'

interface StockCard { id: string; name: string; category: string; quantityOnHand: number; serialNumber: string | null }
interface Loss { id: string; caseNumber: string; itemName: string; category: string; quantity: number; serialNumber: string | null; responsibleName: string; status: string; discoveredAt: string; description: string; version: number; inventoryItemId: string | null }

export function LossesPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const manage = can(auth.user, 'loss.manage')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<Loss | null>(null)
  const [form, setForm] = useState({ itemName: '', category: 'Снаряжение', quantity: 1, serialNumber: '', discoveredAt: toLocalInput(new Date().toISOString()), description: '', inventoryItemId: '' })
  const [linkId, setLinkId] = useState('')
  const list = useQuery({ queryKey: ['losses', page, q], queryFn: () => api<{ items: Loss[]; total: number; pageSize: number }>(`/api/losses?page=${page}&q=${encodeURIComponent(q)}`) })
  const catalog = useQuery({ queryKey: ['catalog'], enabled: manage, queryFn: () => api<{ items: StockCard[] }>('/api/armory/catalog') })
  const save = useMutation({
    mutationFn: () => api('/api/losses', { method: 'POST', body: JSON.stringify({ ...form, serialNumber: form.serialNumber || null, inventoryItemId: form.inventoryItemId || null, discoveredAt: fromLocalInput(form.discoveredAt) }) }),
    onSuccess: async () => { toast.success('Утеря зарегистрирована.'); setOpen(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  async function act(loss: Loss, action: string, returnToStock = false) {
    const answer = await confirm({ title: 'Изменить запись', body: 'Действие будет записано в историю.', reason: true })
    if (!answer.ok) return
    api(`/api/losses/${loss.id}/action`, { method: 'POST', body: JSON.stringify({ version: loss.version, action, notes: answer.reason, returnToStock }) })
      .then(async () => { toast.success('Запись обновлена.'); setCurrent(null); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Склад</p><h1>Утеря и склад</h1></div>{manage && <Button onClick={() => setOpen(true)}>Зарегистрировать утерю</Button>}</div>
      <div className="filters"><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Предмет, номер, сотрудник" /></div>
      <div className="table-wrap"><table><thead><tr><th>Дело</th><th>Предмет</th><th>Кол-во</th><th>Ответственный</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
        {list.data?.items.map((item) => <tr key={item.id} className="clickable" onClick={() => setCurrent(item)}><td>{item.caseNumber}</td><td>{item.itemName}</td><td>{item.quantity}</td><td>{item.responsibleName || '—'}</td><td><Status code={item.status} /></td><td>{when(item.discoveredAt)}</td></tr>)}
      </tbody></table>{!list.data?.items.length && <Empty text={can(auth.user, 'loss.view_all') ? 'Записей нет.' : 'Ваших записей об утере нет.'} />}</div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {open && <Modal title="Регистрация утери" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <Field label="Карточка склада" wide><select value={form.inventoryItemId} onChange={(event) => {
          const card = catalog.data?.items.find((item) => item.id === event.target.value)
          setForm({ ...form, inventoryItemId: event.target.value, itemName: card?.name ?? form.itemName, category: card?.category ?? form.category, serialNumber: card?.serialNumber ?? '' })
        }}><option value="">Без карточки, только текст</option>{catalog.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} — на складе {item.quantityOnHand}</option>)}</select></Field>
        <Field label="Предмет"><input value={form.itemName} onChange={(event) => setForm({ ...form, itemName: event.target.value })} required /></Field>
        <Field label="Категория"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required /></Field>
        <Field label="Количество"><input type="number" min={1} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></Field>
        <Field label="Серийный номер"><input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></Field>
        <Field label="Когда обнаружено"><input type="datetime-local" value={form.discoveredAt} onChange={(event) => setForm({ ...form, discoveredAt: event.target.value })} required /></Field>
        <Field label="Обстоятельства" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <div className="wide"><Button disabled={!auth.online || save.isPending}>Сохранить</Button></div>
      </form></Modal>}
      {current && <Modal title={current.caseNumber} onClose={() => setCurrent(null)}>
        <CopyButton value={current.caseNumber} />
        <p>{current.description}</p>
        <Status code={current.status} />
        {current.inventoryItemId ? <p>Привязано к карточке склада. Возврат изменит её остаток.</p> : manage && (
          <form className="stack" onSubmit={(event) => {
            event.preventDefault()
            if (!linkId) { toast.error('Выберите карточку склада.'); return }
            api<Loss>(`/api/losses/${current.id}/link`, { method: 'POST', body: JSON.stringify({ version: current.version, inventoryItemId: linkId }) })
              .then(async (loss) => { toast.success('Карточка склада привязана.'); setCurrent(loss); setLinkId(''); await queryClient.invalidateQueries() })
              .catch((error: Error) => toast.error(error.message))
          }}>
            <Field label="Привязать карточку склада"><select value={linkId} onChange={(event) => setLinkId(event.target.value)} required><option value="">Выберите</option>{catalog.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} — на складе {item.quantityOnHand}</option>)}</select></Field>
            <Button disabled={!auth.online}>Привязать</Button>
          </form>
        )}
        {manage && <div className="row" style={{ marginTop: 12 }}>
          <Button onClick={() => act(current, 'investigating')}>На проверку</Button>
          <Button onClick={() => act(current, 'found', true)}>Найдено, на склад</Button>
          <Button onClick={() => act(current, 'returned', true)}>Возвращено</Button>
          <Button danger onClick={() => act(current, 'written_off')}>Списать</Button>
          <Button ghost onClick={() => act(current, 'closed')}>Закрыть</Button>
        </div>}
      </Modal>}
    </div>
  )
}
