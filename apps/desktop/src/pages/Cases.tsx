import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { CitizenSelect } from '../citizenPick'
import { when } from '../format'
import { Button, CopyButton, Empty, Field, Modal, Pager, Status, useConfirm, useToast } from '../ui'

interface CaseRow {
  id: string
  caseNumber: string
  title: string
  status: string
  openedAt: string
  location: string
  officerName: string
  suspectFirstName: string
  suspectLastName: string
  version: number
  _count: { seizures: number }
}

interface SeizureBit {
  id: string
  caseNumber: string
  suspectFirstName: string
  suspectLastName: string
  propertyStatus: string
  items: { name: string; quantity: number }[]
}

interface CaseCard extends CaseRow {
  narrative: string
  closeReason: string
  seizures: SeizureBit[]
}

const empty = { title: '', narrative: '', location: '', citizenId: '' }

export function CasesPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const write = can(auth.user, 'cases.manage')
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<typeof empty | null>(null)
  const [seizureId, setSeizureId] = useState('')
  const open = params.get('open')
  const list = useQuery({
    queryKey: ['cases', page, q, status],
    queryFn: () => api<{ items: CaseRow[]; total: number; pageSize: number }>(`/api/cases?page=${page}&q=${encodeURIComponent(q)}&status=${status}`),
  })
  const detail = useQuery({ queryKey: ['case', open], enabled: Boolean(open), queryFn: () => api<CaseCard>(`/api/cases/${open}`) })
  const pool = useQuery({
    queryKey: ['seizures', 'link'],
    enabled: write && Boolean(open) && can(auth.user, 'seizure.view'),
    queryFn: () => api<{ items: { id: string; caseNumber: string; suspectLastName: string; suspectFirstName: string; caseFile: { id: string } | null }[] }>('/api/seizures?pageSize=100'),
  })
  const save = useMutation({
    mutationFn: () => api('/api/cases', { method: 'POST', body: JSON.stringify({ ...draft, citizenId: draft?.citizenId || null }) }),
    onSuccess: async () => {
      toast.success('Дело заведено.')
      setDraft(null)
      await queryClient.invalidateQueries()
    },
    onError: (error: Error) => toast.error(error.message),
  })
  async function setCaseStatus(next: 'open' | 'closed') {
    if (!detail.data) return
    const answer = await confirm({
      title: next === 'closed' ? 'Закрыть дело' : 'Снова открыть дело',
      body: detail.data.caseNumber,
      reason: true,
    })
    if (!answer.ok) return
    api(`/api/cases/${detail.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: detail.data.version, status: next, closeReason: answer.reason, reason: answer.reason }),
    })
      .then(async () => { toast.success(next === 'closed' ? 'Дело закрыто.' : 'Дело снова открыто.'); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  function link(id: string, unlink: boolean) {
    if (!detail.data || !id) return
    api(`/api/cases/${detail.data.id}/link`, { method: 'POST', body: JSON.stringify({ seizureId: id, unlink }) })
      .then(async () => {
        toast.success(unlink ? 'Конфискат отвязан.' : 'Конфискат привязан к делу.')
        setSeizureId('')
        await queryClient.invalidateQueries()
      })
      .catch((error: Error) => toast.error(error.message))
  }
  const free = (pool.data?.items ?? []).filter((item) => !detail.data?.seizures.some((row) => row.id === item.id))
  return (
    <div>
      <div className="page-head">
        <div><p className="kicker">Следствие</p><h1>Дела</h1></div>
        {write && <Button onClick={() => setDraft({ ...empty })}>Новое дело</Button>}
      </div>
      <div className="filters">
        <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Номер, название, фамилия" />
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="">Все</option>
          <option value="open">Открытые</option>
          <option value="closed">Закрытые</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Номер</th><th>Название</th><th>Фигурант</th><th>Конфискат</th><th>Сотрудник</th><th>Статус</th><th>Дата</th></tr></thead>
          <tbody>
            {list.data?.items.map((item) => (
              <tr key={item.id} className="clickable" onClick={() => setParams({ open: item.id })}>
                <td>{item.caseNumber}</td>
                <td>{item.title}</td>
                <td>{item.suspectLastName ? `${item.suspectLastName} ${item.suspectFirstName}` : '—'}</td>
                <td>{item._count.seizures}</td>
                <td>{item.officerName}</td>
                <td><Status code={item.status} /></td>
                <td>{when(item.openedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.items.length && <Empty text="Дел пока нет. Опишите обстоятельства, а конфискат можно привязать к записи." />}
      </div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {draft && (
        <Modal title="Новое дело" onClose={() => setDraft(null)}>
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
            <Field label="Название" wide><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></Field>
            <CitizenSelect value={draft.citizenId} picked="" onChange={(id) => setDraft({ ...draft, citizenId: id })} />
            <Field label="Место"><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></Field>
            <Field label="Обстоятельства" wide><textarea value={draft.narrative} onChange={(event) => setDraft({ ...draft, narrative: event.target.value })} required /></Field>
            <div className="wide"><Button disabled={!auth.online || save.isPending}>Завести дело</Button></div>
          </form>
        </Modal>
      )}
      {detail.data && (
        <Modal title={detail.data.caseNumber} onClose={() => setParams({})}>
          <CopyButton value={detail.data.caseNumber} /> <Status code={detail.data.status} />
          <h2 style={{ margin: '8px 0 4px' }}>{detail.data.title}</h2>
          <p>{detail.data.officerName}{detail.data.location ? ` · ${detail.data.location}` : ''} · {when(detail.data.openedAt)}</p>
          {detail.data.suspectLastName && <p>Фигурант: {detail.data.suspectLastName} {detail.data.suspectFirstName}</p>}
          <p style={{ whiteSpace: 'pre-wrap' }}>{detail.data.narrative}</p>
          {detail.data.closeReason && <p>Закрыто: {detail.data.closeReason}</p>}
          <h3>Конфискат</h3>
          {detail.data.seizures.map((item) => (
            <div key={item.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{item.caseNumber} · {item.suspectLastName} {item.suspectFirstName} · {item.items.map((piece) => piece.name).join(', ') || 'без предметов'}</span>
              {write && <Button small ghost onClick={() => link(item.id, true)}>Отвязать</Button>}
            </div>
          ))}
          {!detail.data.seizures.length && <p className="muted">К делу ещё ничего не изъято.</p>}
          {write && can(auth.user, 'seizure.view') && (
            <div className="row" style={{ marginTop: 8 }}>
              <select value={seizureId} onChange={(event) => setSeizureId(event.target.value)}>
                <option value="">Выберите конфискат</option>
                {free.map((item) => (
                  <option key={item.id} value={item.id}>{item.caseNumber} — {item.suspectLastName} {item.suspectFirstName}{item.caseFile ? ' · уже в деле' : ''}</option>
                ))}
              </select>
              <Button type="button" disabled={!seizureId} onClick={() => link(seizureId, false)}>Привязать</Button>
            </div>
          )}
          {write && (
            <div className="row" style={{ marginTop: 12 }}>
              {detail.data.status === 'open'
                ? <Button danger onClick={() => setCaseStatus('closed')}>Закрыть дело</Button>
                : <Button onClick={() => setCaseStatus('open')}>Открыть снова</Button>}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
