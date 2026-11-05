import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseMoneyToCents, summarizeCharges, totalsError } from '@mdt/shared'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { CitizenSelect } from '../citizenPick'
import { money, when } from '../format'
import { ChargeChoice, PunishmentPicker, type ChargeLaw } from '../sentence'
import { Button, CopyButton, Empty, Field, Modal, Pager, Status, useConfirm, useToast } from '../ui'

interface Law extends ChargeLaw { category?: string }
interface Fine { id: string; fineNumber: string; offenderFirstName: string; offenderLastName: string; issuedAt: string; issuerName: string; description: string; amountCents: number; calculatedCents: number; adjusted: boolean; adjustmentReason: string; jailDays: number; additionalPenalties: string; paymentStatus: string; sentenceStatus: string; version: number; charges: { articleNumber: string; title: string }[]; history?: { fineNumber: string; amountCents: number; paymentStatus: string }[] }

export function FinesPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const issue = can(auth.user, 'fines.issue')
  const adjust = can(auth.user, 'fines.adjust')
  const manage = can(auth.user, 'fines.manage')
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [printDoc, setPrintDoc] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState({ fineNumber: '', citizenId: '', offenderFirstName: '', offenderLastName: '', description: '', charges: [] as ChargeChoice[], adjustment: '', adjustmentReason: '', wantedId: '' })
  const open = params.get('open')
  const list = useQuery({ queryKey: ['fines', page, q], queryFn: () => api<{ items: Fine[]; total: number; pageSize: number }>(`/api/fines?page=${page}&q=${encodeURIComponent(q)}`) })
  const detail = useQuery({ queryKey: ['fine', open], enabled: Boolean(open), queryFn: () => api<Fine>(`/api/fines/${open}`) })
  const laws = useQuery({ queryKey: ['laws', 'fine'], queryFn: () => api<{ items: Law[] }>('/api/laws?pageSize=100&status=active') })
  const wanted = useQuery({ queryKey: ['wanted', 'pick'], queryFn: () => api<{ items: { id: string; caseNumber: string; firstName: string; lastName: string }[] }>('/api/wanted?pageSize=100&status=active') })
  const summary = useMemo(() => summarizeCharges(form.charges.map((choice) => ({
    fineCents: choice.fineCents,
    jailDays: choice.jailDays,
    additionalPenalties: laws.data?.items.find((law) => law.id === choice.lawId)?.additionalPenalties,
  }))), [form.charges, laws.data])
  const overCap = Boolean(totalsError(summary.fineCents, summary.jailDays))
  const save = useMutation({
    mutationFn: () => {
      const cents = form.adjustment ? parseMoneyToCents(form.adjustment) : null
      if (form.adjustment && cents === null) throw new Error('Укажите сумму числом.')
      return api('/api/fines', { method: 'POST', body: JSON.stringify({ fineNumber: form.fineNumber.trim(), offenderFirstName: form.offenderFirstName, offenderLastName: form.offenderLastName, description: form.description, charges: form.charges, adjustmentCents: cents, adjustmentReason: form.adjustmentReason, wantedId: form.wantedId || null, citizenId: form.citizenId || null, idempotencyKey: crypto.randomUUID() }) })
    },
    onSuccess: async () => { toast.success('Штраф оформлен.'); setCreating(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  async function payment(action: string) {
    if (!detail.data) return
    const needsReason = action === 'cancel' || action === 'sentence_cancelled'
    const answer = needsReason ? await confirm({ title: 'Подтверждение', body: 'Действие будет записано в журнал.', reason: true }) : { ok: true, reason: '' }
    if (!answer.ok) return
    api(`/api/fines/${detail.data.id}/payment`, { method: 'POST', body: JSON.stringify({ version: detail.data.version, action, reason: answer.reason }) })
      .then(async () => { toast.success('Штраф обновлён.'); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Наказания</p><h1>Штрафы</h1></div>{issue && <Button onClick={() => setCreating(true)}>Оформить штраф</Button>}</div>
      <div className="filters"><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Имя, номер, сотрудник" /></div>
      <div className="table-wrap"><table><thead><tr><th>Номер</th><th>Нарушитель</th><th>Сумма</th><th>Оплата</th><th>Наказание</th><th>Дата</th></tr></thead><tbody>
        {list.data?.items.map((item) => <tr key={item.id} className="clickable" onClick={() => setParams({ open: item.id })}><td>{item.fineNumber}</td><td>{item.offenderLastName} {item.offenderFirstName}</td><td>{money(item.amountCents, auth.department?.currencySymbol)}</td><td><Status code={item.paymentStatus} /></td><td><Status code={item.sentenceStatus} /></td><td>{when(item.issuedAt)}</td></tr>)}
      </tbody></table>{!list.data?.items.length && <Empty text="Штрафов нет." />}</div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {creating && <Modal title="Штраф" onClose={() => setCreating(false)}><form className="stack" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <div className="form-grid">
          <Field label="Номер из игры" wide><input value={form.fineNumber} onChange={(event) => setForm({ ...form, fineNumber: event.target.value })} placeholder="Номер штрафа, как в игре" required /></Field>
          <CitizenSelect value={form.citizenId} picked={`${form.offenderLastName} ${form.offenderFirstName}`} onChange={(id) => {
            if (!id) { setForm({ ...form, citizenId: '' }); return }
            api<{ firstName: string; lastName: string }>(`/api/citizens/${id}`)
              .then((person) => setForm((current) => ({ ...current, citizenId: id, offenderFirstName: person.firstName, offenderLastName: person.lastName })))
              .catch((error: Error) => toast.error(error.message))
          }} />
          <Field label="Имя"><input value={form.offenderFirstName} onChange={(event) => setForm({ ...form, offenderFirstName: event.target.value })} required readOnly={Boolean(form.citizenId)} /></Field>
          <Field label="Фамилия"><input value={form.offenderLastName} onChange={(event) => setForm({ ...form, offenderLastName: event.target.value })} required readOnly={Boolean(form.citizenId)} /></Field>
          <Field label="Связать с розыском" wide><select value={form.wantedId} onChange={(event) => setForm({ ...form, wantedId: event.target.value })}><option value="">Нет</option>{wanted.data?.items.map((item) => <option key={item.id} value={item.id}>{item.caseNumber} — {item.lastName}</option>)}</select></Field>
          <Field label="Описание" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        </div>
        <PunishmentPicker laws={laws.data?.items ?? []} value={form.charges} symbol={auth.department?.currencySymbol} onChange={(charges) => setForm({ ...form, charges })} />
        {adjust && <div className="form-grid"><Field label="Иная сумма"><input value={form.adjustment} onChange={(event) => setForm({ ...form, adjustment: event.target.value })} /></Field><Field label="Причина изменения"><input value={form.adjustmentReason} onChange={(event) => setForm({ ...form, adjustmentReason: event.target.value })} /></Field></div>}
        <Button disabled={!auth.online || save.isPending || form.charges.length === 0 || overCap}>Выписать</Button>
      </form></Modal>}
      {detail.data && <Modal title={detail.data.fineNumber} onClose={() => setParams({})}>
        <CopyButton value={detail.data.fineNumber} /> <Status code={detail.data.paymentStatus} />
        <p>{detail.data.offenderLastName} {detail.data.offenderFirstName}. Выдал {detail.data.issuerName}, {when(detail.data.issuedAt)}.</p>
        <p>{money(detail.data.amountCents, auth.department?.currencySymbol)}{detail.data.adjusted ? ` (изменено: ${detail.data.adjustmentReason})` : ''}. Срок: {detail.data.jailDays}.</p>
        {detail.data.charges.map((charge) => <div key={charge.articleNumber}>{charge.articleNumber} — {charge.title}</div>)}
        {detail.data.history && detail.data.history.length > 0 && <div><h3>Другие штрафы персонажа</h3>{detail.data.history.map((item) => <div key={item.fineNumber}>{item.fineNumber} · {money(item.amountCents, auth.department?.currencySymbol)}</div>)}</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <Button ghost onClick={() => api<Record<string, unknown>>(`/api/fines/${detail.data?.id}/document`).then(setPrintDoc)}>Документ</Button>
          {manage && <Button onClick={() => payment('mark_paid')}>Оплачен</Button>}
          {manage && <Button onClick={() => payment('sentence_served')}>Наказание исполнено</Button>}
          {manage && <Button danger onClick={() => payment('cancel')}>Отменить</Button>}
        </div>
      </Modal>}
      {printDoc && <div className="modal-back"><div className="paper">
        <p className="kicker">{String(printDoc.county)}</p>
        <h1>{String(printDoc.department)}</h1>
        <h2>Уведомление о штрафе {String(printDoc.fineNumber)}</h2>
        <p>Нарушитель: {String(printDoc.offender)}</p>
        <p>Выдал: {String(printDoc.issuer)}, жетон {String(printDoc.badge)}</p>
        <p>Сумма: {String(printDoc.amount)}. Срок: {String(printDoc.jailDays)}</p>
        <p>{String(printDoc.description)}</p>
        <div className="stamp">ШЕРИФ</div>
        <div className="no-print row"><Button onClick={() => window.print()}>Печать</Button><Button ghost onClick={() => setPrintDoc(null)}>Закрыть</Button></div>
      </div></div>}
    </div>
  )
}
