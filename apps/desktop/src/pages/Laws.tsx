import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { gradeLabel, gradeMark } from '@mdt/shared'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { money, when } from '../format'
import { Button, CopyButton, Empty, Field, Modal, Pager, useToast } from '../ui'

interface Law { id: string; articleNumber: string; title: string; category: string; grade: string; description: string; conditions: string; fineMinCents: number; fineCents: number; jailMin: number; jailDays: number; additionalPenalties: string; status: string; version: number; isDemo: boolean; updatedAt: string; revisions?: { id: string; reason: string; createdAt: string; actorName: string }[] }

const blank = { articleNumber: '', title: '', category: '', grade: '', description: '', conditions: '', fineMinCents: 0, fineCents: 0, jailMin: 0, jailDays: 0, additionalPenalties: '', status: 'active', reason: '' }

export function LawsPage() {
  const auth = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const edit = can(auth.user, 'laws.edit')
  const manage = can(auth.user, 'laws.manage')
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [grade, setGrade] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(blank)
  const [csv, setCsv] = useState('')
  const open = params.get('open')
  const list = useQuery({ queryKey: ['laws', page, q, category, grade], queryFn: () => api<{ items: Law[]; total: number; pageSize: number; categories: string[] }>(`/api/laws?page=${page}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&grade=${encodeURIComponent(grade)}`) })
  const detail = useQuery({ queryKey: ['law', open], enabled: Boolean(open), queryFn: () => api<Law>(`/api/laws/${open}`) })
  useEffect(() => {
    if (!detail.data || creating) return
    setForm({ articleNumber: detail.data.articleNumber, title: detail.data.title, category: detail.data.category, grade: detail.data.grade || '', description: detail.data.description, conditions: detail.data.conditions, fineMinCents: detail.data.fineMinCents, fineCents: detail.data.fineCents, jailMin: detail.data.jailMin, jailDays: detail.data.jailDays, additionalPenalties: detail.data.additionalPenalties, status: detail.data.status, reason: '' })
  }, [detail.data, creating])
  const save = useMutation({
    mutationFn: () => creating
      ? api('/api/laws', { method: 'POST', body: JSON.stringify(form) })
      : api(`/api/laws/${detail.data?.id}`, { method: 'PATCH', body: JSON.stringify({ ...form, version: detail.data?.version }) }),
    onSuccess: async () => { toast.success('Статья сохранена.'); setCreating(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Уложения</p><h1>Законы</h1></div>{edit && <Button onClick={() => { setCreating(true); setForm(blank) }}>Новая статья</Button>}</div>
      <p className="muted">Свод сервера. (i) административное правонарушение, (m) проступок, (f) уголовное преступление. В штрафе и розыске срок и сумму двигают ползунком внутри статьи.</p>
      <div className="filters">
        <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Номер или название" />
        <select value={grade} onChange={(event) => { setGrade(event.target.value); setPage(1) }}>
          <option value="">Все виды</option>
          <option value="i">(i) Административное</option>
          <option value="m">(m) Проступок</option>
          <option value="f">(f) Уголовное</option>
          <option value="none">Общие положения</option>
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Все главы</option>{list.data?.categories.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Статья</th><th>Название</th><th>Вид</th><th>Штраф</th><th>Срок</th><th>Статус</th></tr></thead><tbody>
        {list.data?.items.map((law) => <tr key={law.id} className="clickable" onClick={() => setParams({ open: law.id })}><td>{law.articleNumber}{law.isDemo ? ' · ТЕСТ' : ''}</td><td>{law.title}</td><td>{gradeMark(law.grade) || '—'}</td><td>{moneySpan(law.fineMinCents, law.fineCents, auth.department?.currencySymbol)}</td><td>{termSpan(law.jailMin, law.jailDays)}</td><td>{lawStatusText[law.status] ?? law.status}</td></tr>)}
      </tbody></table>{!list.data?.items.length && <Empty text="Статей пока нет. Их можно импортировать из JSON или CSV." />}</div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {(creating || detail.data) && <Modal title={creating ? 'Новая статья' : detail.data?.articleNumber || ''} onClose={() => { setCreating(false); setParams({}) }}>
        {detail.data && !creating && <CopyButton value={detail.data.articleNumber} />}
        {edit ? <form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <Field label="Номер"><input value={form.articleNumber} onChange={(event) => setForm({ ...form, articleNumber: event.target.value })} required /></Field>
          <Field label="Категория"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required /></Field>
          <Field label="Вид"><select value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })}><option value="">Общее положение</option><option value="i">(i) {gradeLabel('i')}</option><option value="m">(m) {gradeLabel('m')}</option><option value="f">(f) {gradeLabel('f')}</option></select></Field>
          <Field label="Название" wide><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field>
          <Field label="Описание" wide><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <Field label="Условия" wide><textarea value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })} /></Field>
          <Field label="Штраф от, центы"><input type="number" min={0} value={form.fineMinCents} onChange={(event) => setForm({ ...form, fineMinCents: Number(event.target.value) })} /></Field>
          <Field label="Штраф до, центы"><input type="number" min={0} value={form.fineCents} onChange={(event) => setForm({ ...form, fineCents: Number(event.target.value) })} /></Field>
          <Field label="Срок от"><input type="number" min={0} value={form.jailMin} onChange={(event) => setForm({ ...form, jailMin: Number(event.target.value) })} /></Field>
          <Field label="Срок до"><input type="number" min={0} value={form.jailDays} onChange={(event) => setForm({ ...form, jailDays: Number(event.target.value) })} /></Field>
          <Field label="Дополнительные наказания" wide><input value={form.additionalPenalties} onChange={(event) => setForm({ ...form, additionalPenalties: event.target.value })} /></Field>
          <Field label="Статус"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} disabled={form.status === 'repealed' && !manage}><option value="active">Действует</option><option value="amended">Изменена</option><option value="repealed" disabled={!manage}>Отменена</option></select></Field>
          {!creating && <Field label="Причина изменения"><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></Field>}
          <div className="wide"><Button disabled={!auth.online || save.isPending}>Сохранить</Button></div>
        </form> : detail.data && <div><h2>{detail.data.title}</h2><p>{detail.data.description}</p><p>{detail.data.conditions}</p><p>Изменено: {when(detail.data.updatedAt)}</p></div>}
        {detail.data?.revisions && <div>{detail.data.revisions.map((revision) => <div key={revision.id} className="muted">{when(revision.createdAt)} — {revision.actorName}: {revision.reason}</div>)}</div>}
      </Modal>}
      {manage && <section className="panel" style={{ marginTop: 16 }}>
        <h2>Импорт</h2>
        <p className="muted">Список статей в JSON или таблица CSV. Колонки: номер, название, категория, описание, условия, штраф, сроки, наказания, статус. Штраф можно писать как 12.50 или целым числом центов.</p>
        <textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="номер,название,категория,штраф" />
        <div className="row" style={{ marginTop: 8 }}>
          <Button onClick={() => {
            let request: Promise<unknown>
            try {
              request = csv.trim().startsWith('[')
                ? api('/api/laws/import', { method: 'POST', body: JSON.stringify({ mode: 'upsert', laws: JSON.parse(csv) }) })
                : api('/api/laws/import-csv', { method: 'POST', body: JSON.stringify({ mode: 'upsert', csv }) })
            } catch {
              toast.error('Файл законов не разобран. Проверьте список статей.')
              return
            }
            request.then(async (result) => {
              const data = result as { created?: number; updated?: number }
              toast.success(`Загружено: новых ${data.created ?? 0}, обновлено ${data.updated ?? 0}.`)
              await queryClient.invalidateQueries()
            }).catch((error: Error) => toast.error(error.message))
          }}>Загрузить</Button>
        </div>
      </section>}
    </div>
  )
}

function moneySpan(min: number, max: number, symbol?: string) {
  if (!min && !max) return '—'
  if (min === max) return money(max, symbol)
  return `${money(min, symbol)}–${money(max, symbol)}`
}

function termSpan(min: number, max: number) {
  if (!min && !max) return '—'
  if (min === max) return String(max)
  return `${min}–${max}`
}

const lawStatusText: Record<string, string> = { active: 'Действует', amended: 'Изменена', repealed: 'Отменена' }
