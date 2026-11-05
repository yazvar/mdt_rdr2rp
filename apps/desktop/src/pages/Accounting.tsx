import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { parseMoneyToCents } from '@mdt/shared'
import { API_URL, api, getToken } from '../api'
import { can, useAuth } from '../auth'
import { money, when } from '../format'
import { Button, Empty, Field, Modal, Status, useToast } from '../ui'

interface Entry { id: string; entryNumber: string; direction: 'in' | 'out'; amountCents: number; occurredAt: string; description: string; authorName: string; category: { name: string }; currencyCode: string }
interface Report { summary: { incomeCents: number; expenseCents: number; balanceCents: number }; balance: { balanceCents: number }; items: Entry[] }

export function AccountingPage() {
  const auth = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const manage = can(auth.user, 'accounting.manage')
  const [preset, setPreset] = useState('month')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ direction: 'out', amount: '', categoryId: '', description: '' })
  const report = useQuery({ queryKey: ['ledger', preset], queryFn: () => api<Report>(`/api/accounting/entries?preset=${preset}`) })
  const categories = useQuery({ queryKey: ['finance-categories'], queryFn: () => api<{ items: { id: string; name: string; direction: string }[] }>('/api/accounting/categories') })
  const symbol = auth.department?.currencySymbol ?? '$'
  const save = useMutation({
    mutationFn: () => {
      const amountCents = parseMoneyToCents(form.amount)
      if (amountCents === null) throw new Error('Укажите сумму числом.')
      return api('/api/accounting/entries', { method: 'POST', body: JSON.stringify({ direction: form.direction, categoryId: form.categoryId, description: form.description, amountCents, idempotencyKey: crypto.randomUUID() }) })
    },
    onSuccess: async () => { toast.success('Проводка записана. Баланс пересчитан сервером.'); setOpen(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  async function download() {
    const token = await getToken()
    const response = await fetch(`${API_URL}/api/accounting/export?preset=${preset}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) { toast.error('Отчёт не выгружен.'); return }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ledger.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Казна</p><h1>Бухгалтерия</h1></div><div className="row">{manage && <Button onClick={() => setOpen(true)}>Проводка</Button>}<Button ghost onClick={download}>CSV</Button></div></div>
      <div className="cards">
        <article className="card"><span>Баланс департамента</span><b>{money(report.data?.balance.balanceCents, symbol)}</b></article>
        <article className="card"><span>Доходы периода</span><b>{money(report.data?.summary.incomeCents, symbol)}</b></article>
        <article className="card"><span>Расходы периода</span><b>{money(report.data?.summary.expenseCents, symbol)}</b></article>
        <article className="card"><span>Итог периода</span><b>{money(report.data?.summary.balanceCents, symbol)}</b></article>
      </div>
      <div className="filters">
        <select value={preset} onChange={(event) => setPreset(event.target.value)}><option value="day">День</option><option value="week">Неделя</option><option value="month">Месяц</option></select>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Номер</th><th>Дата</th><th>Тип</th><th>Категория</th><th>Сумма</th><th>Описание</th><th>Автор</th></tr></thead><tbody>
        {report.data?.items.map((item) => <tr key={item.id}><td>{item.entryNumber}</td><td>{when(item.occurredAt)}</td><td><Status code={item.direction} /></td><td>{item.category.name}</td><td>{money(item.amountCents, symbol)}</td><td>{item.description}</td><td>{item.authorName}</td></tr>)}
      </tbody></table>{!report.data?.items.length && <Empty text="За период проводок нет." />}</div>
      {open && <Modal title="Финансовая операция" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <Field label="Тип"><select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value, categoryId: '' })}><option value="in">Доход</option><option value="out">Расход</option></select></Field>
        <Field label="Сумма"><input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></Field>
        <Field label="Категория" wide><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} required><option value="">Выберите</option>{categories.data?.items.filter((item) => item.direction === form.direction).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Описание" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></Field>
        <div className="wide"><Button disabled={!auth.online || save.isPending}>Провести</Button></div>
      </form></Modal>}
    </div>
  )
}
