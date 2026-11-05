import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { fromLocalInput, toLocalInput, when } from '../format'
import { Button, CopyButton, Empty, Field, Modal, Pager, Status, useConfirm, useToast } from '../ui'

interface Employee {
  id: string
  firstName: string
  lastName: string
  badgeNumber: string
  rankId: string
  rank: string
  position: string | null
  discordId: string | null
  status: string
  joinedAt: string
  contact: string
  notes: string
  serviceComments: string
  version: number
  accessGranted: boolean
  roles: { key: string; name: string }[]
  history?: { id: string; type: string; fromValue: string; toValue: string; reason: string; actorName: string; createdAt: string }[]
}

const empty = { firstName: '', lastName: '', badgeNumber: '', rankId: '', position: '', discordId: '', status: 'active', joinedAt: toLocalInput(new Date().toISOString()), contact: '', notes: '', serviceComments: '', grantAccess: false, roleKeys: [] as string[], reason: '' }

export function EmployeesPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const manage = can(auth.user, 'personnel.manage')
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(empty)
  const open = params.get('open')
  const list = useQuery({
    queryKey: ['employees', page, q, status],
    queryFn: () => api<{ items: Employee[]; total: number; pageSize: number }>(`/api/employees?page=${page}&q=${encodeURIComponent(q)}&status=${status}`),
  })
  const detail = useQuery({
    queryKey: ['employee', open],
    enabled: Boolean(open),
    queryFn: () => api<Employee>(`/api/employees/${open}`),
  })
  const ranks = useQuery({ queryKey: ['ranks'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/api/ranks') })
  const roles = useQuery({ queryKey: ['assignable-roles'], enabled: manage, queryFn: () => api<{ items: { key: string; name: string }[] }>('/api/employees/roles') })
  const save = useMutation({
    mutationFn: async () => {
      const { reason, ...fields } = form
      const payload = { ...fields, joinedAt: fromLocalInput(form.joinedAt), discordId: form.discordId || null, position: form.position || null }
      if (detail.data && !creating) {
        const rankChanged = form.rankId !== detail.data.rankId
        const statusChanged = form.status !== detail.data.status
        if ((rankChanged || statusChanged) && reason.trim().length < 3) {
          throw new Error('Укажите причину изменения звания или статуса.')
        }
        return api(`/api/employees/${detail.data.id}`, { method: 'PATCH', body: JSON.stringify({ ...payload, version: detail.data.version, roleKeys: form.roleKeys, grantAccess: form.grantAccess, reason }) })
      }
      return api('/api/employees', { method: 'POST', body: JSON.stringify(payload) })
    },
    onSuccess: async () => { toast.success('Карточка сохранена.'); setCreating(false); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  function edit(employee: Employee) {
    setCreating(false)
    setForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      badgeNumber: employee.badgeNumber,
      rankId: employee.rankId,
      position: employee.position ?? '',
      discordId: employee.discordId && /^\d+$/.test(employee.discordId) ? employee.discordId : '',
      status: employee.status,
      joinedAt: toLocalInput(employee.joinedAt),
      contact: employee.contact,
      notes: employee.notes,
      serviceComments: employee.serviceComments,
      grantAccess: employee.accessGranted,
      roleKeys: employee.roles.map((role) => role.key),
      reason: '',
    })
  }
  useEffect(() => {
    if (!creating && detail.data) edit(detail.data)
  }, [creating, detail.data?.id])
  return (
    <div>
      <div className="page-head">
        <div><p className="kicker">Реестр</p><h1>Сотрудники</h1></div>
        {manage && <Button onClick={() => { setCreating(true); setForm(empty); setParams({}) }}>Новая карточка</Button>}
      </div>
      <div className="filters">
        <input value={q} onChange={(event) => { setQ(event.target.value); setPage(1) }} placeholder="Имя, фамилия, табельный номер" />
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="">Все статусы</option>
          <option value="active">На службе</option>
          <option value="suspended">Отстранён</option>
          <option value="on_leave">В отпуске</option>
          <option value="dismissed">Уволен</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Сотрудник</th><th>Табельный</th><th>Звание</th><th>Статус</th><th>Discord</th></tr></thead>
          <tbody>
            {list.data?.items.map((item) => (
              <tr key={item.id} className="clickable" onClick={() => { setParams({ open: item.id }); setCreating(false) }}>
                <td>{item.lastName} {item.firstName}</td>
                <td>{item.badgeNumber}</td>
                <td>{item.rank}</td>
                <td><Status code={item.status} /></td>
                <td>{item.discordId || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.data?.items.length && <Empty text="Сотрудники не найдены." />}
      </div>
      <Pager page={page} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
      {(creating || (open && detail.data)) && (
        <Modal title={creating ? 'Новый сотрудник' : `${detail.data?.lastName} ${detail.data?.firstName}`} onClose={() => { setCreating(false); setParams({}) }}>
          {detail.data && !creating && (
            <div className="row" style={{ marginBottom: 10 }}>
              <CopyButton value={detail.data.badgeNumber} />
              <Status code={detail.data.status} />
              <span className="muted">{detail.data.roles.map((role) => role.name).join(', ') || 'Доступ не выдан'}</span>
            </div>
          )}
          {manage ? (
            <form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
              <Field label="Имя"><input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required /></Field>
              <Field label="Фамилия"><input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required /></Field>
              <Field label="Табельный номер"><input value={form.badgeNumber} onChange={(event) => setForm({ ...form, badgeNumber: event.target.value })} required /></Field>
              <Field label="Звание"><select value={form.rankId} onChange={(event) => setForm({ ...form, rankId: event.target.value })} required><option value="">Выберите</option>{ranks.data?.items.map((rank) => <option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></Field>
              <Field label="Должность"><input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} /></Field>
              <Field label="Статус"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">На службе</option><option value="suspended">Отстранён</option><option value="on_leave">В отпуске</option><option value="dismissed">Уволен</option></select></Field>
              <Field label="Discord ID"><input value={form.discordId} onChange={(event) => setForm({ ...form, discordId: event.target.value })} inputMode="numeric" /></Field>
              <Field label="Дата вступления"><input type="datetime-local" value={form.joinedAt} onChange={(event) => setForm({ ...form, joinedAt: event.target.value })} required /></Field>
              <Field label="Контакт" wide><input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} /></Field>
              <Field label="Примечания" wide><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
              <Field label="Служебные комментарии" wide><textarea value={form.serviceComments} onChange={(event) => setForm({ ...form, serviceComments: event.target.value })} /></Field>
              {!creating && detail.data && (form.rankId !== detail.data.rankId || form.status !== detail.data.status) && (
                <Field label="Причина изменения звания или статуса" wide><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required minLength={3} placeholder="Не короче 3 символов" /></Field>
              )}
              <label className="wide"><input type="checkbox" checked={form.grantAccess} onChange={(event) => setForm({ ...form, grantAccess: event.target.checked })} /> Разрешить вход в MDT</label>
              {form.grantAccess && <div className="check-grid wide">{roles.data?.items.map((role) => <label key={role.key}><input type="checkbox" checked={form.roleKeys.includes(role.key)} onChange={(event) => setForm({ ...form, roleKeys: event.target.checked ? [...form.roleKeys, role.key] : form.roleKeys.filter((key) => key !== role.key) })} /> {role.name}</label>)}</div>}
              <div className="row wide">
                <Button type="submit" disabled={save.isPending || !auth.online}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</Button>
                {!creating && detail.data && (
                  <Button danger type="button" onClick={async () => {
                    const answer = await confirm({ title: 'Архивировать карточку', body: 'Сотрудник будет отмечен уволенным. Запись останется в архиве.', danger: true, reason: true })
                    if (!answer.ok) return
                    api(`/api/employees/${detail.data?.id}/archive`, { method: 'POST', body: JSON.stringify({ reason: answer.reason, version: detail.data?.version }) })
                      .then(async () => { toast.success('Карточка архивирована.'); await queryClient.invalidateQueries() })
                      .catch((error: Error) => toast.error(error.message))
                  }}>В архив</Button>
                )}
              </div>
            </form>
          ) : detail.data && (
            <div className="stack">
              <div>Табельный {detail.data.badgeNumber}, {detail.data.rank}</div>
              <div>Контакт: {detail.data.contact || '—'}</div>
              <div>{detail.data.notes}</div>
            </div>
          )}
          {detail.data?.history && !creating && (
            <div style={{ marginTop: 16 }}>
              <h3>История</h3>
              {detail.data.history.map((item) => <div key={item.id} className="muted">{when(item.createdAt)} — {item.type}: {item.fromValue} → {item.toValue} {item.reason}</div>)}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
