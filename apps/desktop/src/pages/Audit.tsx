import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { actionText, moduleText, when } from '../format'
import { Empty, Pager, Status } from '../ui'

interface Row { id: string; createdAt: string; actorName: string; discordId: string; action: string; module: string; recordId: string; reason: string; result: string; oldValues: unknown; newValues: unknown }

export function AuditPage() {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [module, setModule] = useState('')
  const [open, setOpen] = useState<Row | null>(null)
  const list = useQuery({ queryKey: ['audit', page, q, module], queryFn: () => api<{ items: Row[]; total: number; pageSize: number }>(`/api/audit?page=${page}&q=${encodeURIComponent(q)}&module=${module}`) })
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Надзор</p><h1>Журнал действий</h1></div></div>
      <div className="filters"><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Имя, Discord, действие" /><input value={module} onChange={(event) => setModule(event.target.value)} placeholder="Модуль" /></div>
      <div className="table-wrap"><table><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Модуль</th><th>Результат</th></tr></thead><tbody>
        {list.data?.items.map((item) => <tr key={item.id} className="clickable" onClick={() => setOpen(item)}><td>{when(item.createdAt)}</td><td>{item.actorName}<div className="muted">{item.discordId}</div></td><td>{actionText(item.action)}</td><td>{moduleText(item.module)}</td><td><Status code={item.result === 'success' ? 'active' : 'cancelled'} /></td></tr>)}
      </tbody></table>{!list.data?.items.length && <Empty text="Записей журнала нет." />}</div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {open && <div className="modal-back" onMouseDown={() => setOpen(null)}><div className="modal" onMouseDown={(event) => event.stopPropagation()}><h2>{actionText(open.action)}</h2><p>{open.reason || 'Причина не указана.'}</p><p className="muted">{moduleText(open.module)}</p></div></div>}
    </div>
  )
}
