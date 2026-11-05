import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseMoneyToCents } from '@mdt/shared'
import { useState } from 'react'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { money, when } from '../format'
import { Button, Empty, Field, Modal, Pager, Status, useToast } from '../ui'

interface Item { id: string; name: string; category: string; serialNumber: string | null; quantityOnHand: number; unitCostCents: number | null; version?: number }
interface Issue { id: string; itemName: string; quantity: number; serialNumber: string | null; employeeName: string; employeeBadge: string; status: string; issuedAt: string; version: number }

export function ArmoryPage() {
  const auth = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const manage = can(auth.user, 'armory.manage')
  const all = can(auth.user, 'armory.view_all')
  const [tab, setTab] = useState<'stock' | 'issues' | 'warnings'>('issues')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<'item' | 'issue' | null>(null)
  const [itemForm, setItemForm] = useState({ name: '', category: 'Оружие', quantity: 1, serialNumber: '', unitCost: '' })
  const [issueForm, setIssueForm] = useState({ itemId: '', employeeId: '', quantity: 1, serialNumber: '', notes: '' })
  const items = useQuery({ queryKey: ['armory-items', page, q], enabled: all, queryFn: () => api<{ items: Item[]; total: number; pageSize: number }>(`/api/armory/items?page=${page}&q=${encodeURIComponent(q)}`) })
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<{ items: Item[] }>('/api/armory/catalog') })
  const issues = useQuery({ queryKey: ['issues', page, q], queryFn: () => api<{ items: Issue[]; total: number; pageSize: number }>(`/api/armory/issues?page=${page}&q=${encodeURIComponent(q)}`) })
  const warnings = useQuery({ queryKey: ['warnings'], enabled: manage && tab === 'warnings', queryFn: () => api<{ warnings: { message: string }[] }>('/api/armory/warnings') })
  const employees = useQuery({ queryKey: ['employees', 'pick'], enabled: manage, queryFn: () => api<{ items: { id: string; firstName: string; lastName: string; badgeNumber: string }[] }>('/api/employees?pageSize=100&status=active') })
  const done = async (text: string) => { toast.success(text); setOpen(null); await queryClient.invalidateQueries() }
  const createItem = useMutation({
    mutationFn: () => {
      const unitCostCents = itemForm.unitCost.trim() ? parseMoneyToCents(itemForm.unitCost) : null
      if (itemForm.unitCost.trim() && unitCostCents === null) throw new Error('Укажите цену числом.')
      return api('/api/armory/items', { method: 'POST', body: JSON.stringify({ name: itemForm.name, category: itemForm.category, quantity: itemForm.quantity, serialNumber: itemForm.serialNumber || null, unitCostCents, notes: '' }) })
    },
    onSuccess: () => done('Предмет поставлен на учёт.'),
    onError: (error: Error) => toast.error(error.message),
  })
  const issue = useMutation({
    mutationFn: () => api('/api/armory/issues', { method: 'POST', body: JSON.stringify({ ...issueForm, serialNumber: issueForm.serialNumber || null, idempotencyKey: crypto.randomUUID() }) }),
    onSuccess: () => done('Снаряжение выдано и списано со склада.'),
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <div>
      <div className="page-head">
        <div><p className="kicker">Снабжение</p><h1>Вооружение и снаряжение</h1></div>
        {manage && <div className="row"><Button onClick={() => setOpen('item')}>На склад</Button><Button onClick={() => setOpen('issue')}>Выдать</Button></div>}
      </div>
      <div className="filters">
        {all && <Button ghost small onClick={() => setTab('stock')}>Склад</Button>}
        <Button ghost small onClick={() => setTab('issues')}>{all ? 'Все выдачи' : 'Моё снаряжение'}</Button>
        {manage && <Button ghost small onClick={() => setTab('warnings')}>Предупреждения</Button>}
        <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Предмет, номер, сотрудник" />
      </div>
      {tab === 'stock' && all && (
        <>
          <div className="table-wrap"><table><thead><tr><th>Предмет</th><th>Категория</th><th>Номер</th><th>Остаток</th><th>Цена</th></tr></thead><tbody>
            {items.data?.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.category}</td><td>{item.serialNumber || '—'}</td><td>{item.quantityOnHand}</td><td>{item.unitCostCents != null ? money(item.unitCostCents, auth.department?.currencySymbol) : '—'}</td></tr>)}
          </tbody></table>{!items.data?.items.length && <Empty text="Склад пуст." />}</div>
          <Pager page={page} pageSize={items.data?.pageSize ?? 20} total={items.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      {tab === 'issues' && (
        <>
          <div className="table-wrap"><table><thead><tr><th>Предмет</th><th>Кол-во</th><th>Сотрудник</th><th>Статус</th><th>Дата</th><th></th></tr></thead><tbody>
            {issues.data?.items.map((row) => <tr key={row.id}><td>{row.itemName}<div className="muted">{row.serialNumber}</div></td><td>{row.quantity}</td><td>{row.employeeName} · {row.employeeBadge}</td><td><Status code={row.status} /></td><td>{when(row.issuedAt)}</td><td>{manage && row.status === 'issued' && <Button small onClick={() => api(`/api/armory/issues/${row.id}/return`, { method: 'POST', body: JSON.stringify({ version: row.version, notes: 'Возврат на склад' }) }).then(() => done('Предмет возвращён на склад.')).catch((error: Error) => toast.error(error.message))}>Вернуть</Button>}</td></tr>)}
          </tbody></table>{!issues.data?.items.length && <Empty text="Выдач нет." />}</div>
          <Pager page={page} pageSize={issues.data?.pageSize ?? 20} total={issues.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      {tab === 'warnings' && <div className="panel">{warnings.data?.warnings.length ? warnings.data.warnings.map((item) => <div key={item.message} className="notice">{item.message}</div>) : <Empty text="Расхождений склада не найдено." />}</div>}
      {open === 'item' && <Modal title="Постановка на склад" onClose={() => setOpen(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); createItem.mutate() }}>
        <Field label="Название"><input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} required /></Field>
        <Field label="Категория"><input value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} required /></Field>
        <Field label="Количество"><input type="number" min={0} value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: Number(event.target.value) })} /></Field>
        <Field label="Серийный номер"><input value={itemForm.serialNumber} onChange={(event) => setItemForm({ ...itemForm, serialNumber: event.target.value })} /></Field>
        <Field label="Цена за единицу"><input value={itemForm.unitCost} onChange={(event) => setItemForm({ ...itemForm, unitCost: event.target.value })} /></Field>
        <div className="wide"><Button disabled={!auth.online || createItem.isPending}>Сохранить</Button></div>
      </form></Modal>}
      {open === 'issue' && <Modal title="Выдача снаряжения" onClose={() => setOpen(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); issue.mutate() }}>
        <Field label="Предмет" wide><select value={issueForm.itemId} onChange={(event) => setIssueForm({ ...issueForm, itemId: event.target.value })} required><option value="">Выберите</option>{catalog.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} — на складе {item.quantityOnHand}</option>)}</select></Field>
        <Field label="Сотрудник" wide><select value={issueForm.employeeId} onChange={(event) => setIssueForm({ ...issueForm, employeeId: event.target.value })} required><option value="">Выберите</option>{employees.data?.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.lastName} {employee.firstName} · {employee.badgeNumber}</option>)}</select></Field>
        <Field label="Количество"><input type="number" min={1} value={issueForm.quantity} onChange={(event) => setIssueForm({ ...issueForm, quantity: Number(event.target.value) })} /></Field>
        <Field label="Серийный номер"><input value={issueForm.serialNumber} onChange={(event) => setIssueForm({ ...issueForm, serialNumber: event.target.value })} /></Field>
        <div className="wide"><Button disabled={!auth.online || issue.isPending}>Выдать</Button></div>
      </form></Modal>}
    </div>
  )
}
