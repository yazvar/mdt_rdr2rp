import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { DEFAULT_NOTIFY_EVENTS } from '@mdt/shared'
import { API_URL, api, getToken } from '../api'
import { useAuth } from '../auth'
import { notifyLabel, sourceText, when } from '../format'
import { playAlert } from '../sound'
import { Button, Field, Modal, useConfirm, useToast } from '../ui'

interface UserRow { id: string; discordId: string; username: string; accessGranted: boolean; blocked: boolean; employee: { name: string; badgeNumber: string } | null; roles: { key: string; name: string }[] }
interface RoleRow { id: string; key: string; name: string; description: string; system: boolean; permissions: string[] }
interface Settings { departmentName: string; countyName: string; motto: string; currencySymbol: string; currencyCode: string; recognizeFineOnPayment: boolean; recognizeEquipmentCost: boolean; discordGuildId: string; extraRecipientDiscordIds: string[]; notifyEvents: Record<string, boolean> }

const summaryLabel: Record<string, string> = {
  users: 'Пользователи',
  employees: 'Сотрудники',
  issues: 'Выдачи',
  losses: 'Утери',
  seizures: 'Конфискат',
  laws: 'Статьи',
  wanted: 'Розыск',
  fines: 'Штрафы',
  requests: 'Запросы',
  entries: 'Проводки',
  errors: 'Ошибки',
}

export function AdminPage() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'users' | 'roles' | 'settings' | 'errors' | 'backup' | 'release' | 'duty'>('users')
  const [grant, setGrant] = useState({ discordId: '', roleKeys: ['deputy'] as string[], employeeId: '' })
  const [employeeQ, setEmployeeQ] = useState('')
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ items: UserRow[] }>('/api/admin/users?pageSize=100') })
  const employees = useQuery({ queryKey: ['admin-employees', employeeQ], enabled: tab === 'users', queryFn: () => api<{ items: { id: string; firstName: string; lastName: string; badgeNumber: string }[] }>(`/api/employees?pageSize=100&archived=all&q=${encodeURIComponent(employeeQ)}`) })
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<{ roles: RoleRow[]; permissions: { key: string; description: string }[] }>('/api/admin/roles') })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/admin/settings') })
  const errors = useQuery({ queryKey: ['errors'], enabled: tab === 'errors', queryFn: () => api<{ items: { id: string; createdAt: string; source: string; message: string }[] }>('/api/admin/errors') })
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Record<string, number>>('/api/admin/summary') })
  const [draft, setDraft] = useState<Settings | null>(null)
  const current = draft ?? settings.data
  async function block(user: UserRow, blocked: boolean) {
    const answer = await confirm({ title: blocked ? 'Заблокировать вход' : 'Снять блокировку', body: user.discordId, reason: true, danger: blocked })
    if (!answer.ok) return
    api(`/api/admin/users/${user.id}/${blocked ? 'block' : 'unblock'}`, { method: 'POST', body: JSON.stringify({ reason: answer.reason }) })
      .then(async () => { toast.success('Доступ изменён.'); await queryClient.invalidateQueries() })
      .catch((error: Error) => toast.error(error.message))
  }
  const saveSettings = useMutation({
    mutationFn: () => api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(current ? settingsPayload(current) : {}) }),
    onSuccess: async () => { toast.success('Настройки сохранены.'); setDraft(null); await queryClient.invalidateQueries() },
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <div>
      <div className="page-head"><div><p className="kicker">Технический доступ</p><h1>Администрация</h1></div></div>
      <div className="cards">{Object.entries(summary.data ?? {}).map(([key, value]) => <article className="card" key={key}><span>{summaryLabel[key] ?? key}</span><b>{value}</b></article>)}</div>
      <div className="filters">
        <Button ghost small className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Пользователи</Button>
        <Button ghost small className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Роли</Button>
        <Button ghost small className={tab === 'duty' ? 'on' : ''} onClick={() => setTab('duty')}>Смена</Button>
        <Button ghost small className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Настройки</Button>
        <Button ghost small className={tab === 'errors' ? 'on' : ''} onClick={() => setTab('errors')}>Ошибки</Button>
        <Button ghost small className={tab === 'backup' ? 'on' : ''} onClick={() => setTab('backup')}>Архив базы</Button>
        <Button ghost small className={tab === 'release' ? 'on' : ''} onClick={() => setTab('release')}>Обновление</Button>
      </div>
      <div key={tab} className="page-enter">
      {tab === 'users' && <div className="panel">
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); api('/api/admin/users/grant', { method: 'POST', body: JSON.stringify({ discordId: grant.discordId, roleKeys: grant.roleKeys, employeeId: grant.employeeId || null }) }).then(async () => { toast.success('Доступ выдан.'); await queryClient.invalidateQueries() }).catch((error: Error) => toast.error(error.message)) }}>
          <Field label="Discord ID"><input value={grant.discordId} onChange={(event) => setGrant({ ...grant, discordId: event.target.value })} required inputMode="numeric" /></Field>
          <Field label="Роль"><select value={grant.roleKeys[0]} onChange={(event) => setGrant({ ...grant, roleKeys: [event.target.value] })}>{roles.data?.roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></Field>
          <Field label="Найти карточку сотрудника"><input value={employeeQ} onChange={(event) => setEmployeeQ(event.target.value)} placeholder="Фамилия или табельный" /></Field>
          <Field label="Карточка сотрудника"><select value={grant.employeeId} onChange={(event) => setGrant({ ...grant, employeeId: event.target.value })}><option value="">Без карточки</option>{employees.data?.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.lastName} {employee.firstName} · {employee.badgeNumber}</option>)}</select></Field>
          <div className="wide"><Button disabled={!auth.online}>Выдать доступ</Button></div>
        </form>
        <div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Discord</th><th>Имя</th><th>Сотрудник</th><th>Роли</th><th></th></tr></thead><tbody>
          {users.data?.items.map((user) => <tr key={user.id}><td>{user.discordId}</td><td>{user.username}{user.blocked ? ' · блок' : ''}{!user.accessGranted ? ' · нет доступа' : ''}</td><td>{user.employee ? `${user.employee.name} ${user.employee.badgeNumber}` : '—'}</td><td>{user.roles.map((role) => role.name).join(', ')}</td><td className="row"><select defaultValue={user.roles[0]?.key ?? ''} onChange={(event) => {
            const roleKey = event.target.value
            confirm({ title: 'Сменить должность', body: user.discordId, reason: true }).then((answer) => {
              if (!answer.ok) return
              api(`/api/admin/users/${user.id}/roles`, { method: 'POST', body: JSON.stringify({ roleKeys: [roleKey], accessGranted: true, reason: answer.reason }) })
                .then(async () => { toast.success('Должность обновлена.'); await queryClient.invalidateQueries() })
                .catch((error: Error) => toast.error(error.message))
            })
          }}>{roles.data?.roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select><Button small danger={!user.blocked} onClick={() => block(user, !user.blocked)}>{user.blocked ? 'Разблокировать' : 'Блок'}</Button><Button small ghost onClick={() => confirm({ title: 'Отозвать сессии', body: 'Пользователю придётся войти снова.', reason: true }).then((answer) => {
            if (!answer.ok) return
            api(`/api/admin/users/${user.id}/sessions/revoke`, { method: 'POST', body: JSON.stringify({ reason: answer.reason }) })
              .then(() => toast.success('Сессии отозваны.'))
              .catch((error: Error) => toast.error(error.message))
          })}>Сессии</Button></td></tr>)}
        </tbody></table></div>
      </div>}
      {tab === 'roles' && <RoleEditor roles={roles.data?.roles ?? []} permissions={roles.data?.permissions ?? []} />}
      {tab === 'settings' && current && <form className="panel form-grid" onSubmit={(event) => { event.preventDefault(); saveSettings.mutate() }}>
        <Field label="Название"><input value={current.departmentName} onChange={(event) => setDraft({ ...current, departmentName: event.target.value })} /></Field>
        <Field label="Округ"><input value={current.countyName} onChange={(event) => setDraft({ ...current, countyName: event.target.value })} /></Field>
        <Field label="Девиз" wide><input value={current.motto} onChange={(event) => setDraft({ ...current, motto: event.target.value })} /></Field>
        <Field label="Знак валюты"><input value={current.currencySymbol} onChange={(event) => setDraft({ ...current, currencySymbol: event.target.value })} /></Field>
        <Field label="Код валюты"><input value={current.currencyCode} onChange={(event) => setDraft({ ...current, currencyCode: event.target.value })} /></Field>
        <Field label="Discord-сервер для уведомлений"><input value={current.discordGuildId} onChange={(event) => setDraft({ ...current, discordGuildId: event.target.value })} /></Field>
        <label className="wide"><input type="checkbox" checked={current.recognizeFineOnPayment} onChange={(event) => setDraft({ ...current, recognizeFineOnPayment: event.target.checked })} /> Проводить оплаченный штраф в доход</label>
        <label className="wide"><input type="checkbox" checked={current.recognizeEquipmentCost} onChange={(event) => setDraft({ ...current, recognizeEquipmentCost: event.target.checked })} /> Списывать стоимость снаряжения при выдаче</label>
        <Field label="Дополнительные Discord ID получателей" wide><input value={current.extraRecipientDiscordIds.join(', ')} onChange={(event) => setDraft({ ...current, extraRecipientDiscordIds: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></Field>
        <div className="wide">{Object.keys({ ...DEFAULT_NOTIFY_EVENTS, ...current.notifyEvents }).map((key) => <label key={key} style={{ display: 'block' }}><input type="checkbox" checked={current.notifyEvents[key] !== false} onChange={(event) => setDraft({ ...current, notifyEvents: { ...current.notifyEvents, [key]: event.target.checked } })} /> {notifyLabel[key] ?? 'Уведомление'}</label>)}</div>
        <div className="wide"><Button disabled={!auth.online}>Сохранить</Button></div>
      </form>}
      {tab === 'settings' && <RanksBox />}
      {tab === 'errors' && <div className="table-wrap"><table><thead><tr><th>Время</th><th>Источник</th><th>Сообщение</th></tr></thead><tbody>{errors.data?.items.map((item) => <tr key={item.id}><td>{when(item.createdAt)}</td><td>{sourceText(item.source)}</td><td>{item.message}</td></tr>)}</tbody></table></div>}
      {tab === 'backup' && <BackupPanel />}
      {tab === 'release' && <ReleasePanel />}
      {tab === 'duty' && <DutyPanel />}
      </div>
    </div>
  )
}

function settingsPayload(value: Settings) {
  return {
    departmentName: value.departmentName,
    countyName: value.countyName,
    motto: value.motto,
    currencySymbol: value.currencySymbol,
    currencyCode: value.currencyCode,
    recognizeFineOnPayment: value.recognizeFineOnPayment,
    recognizeEquipmentCost: value.recognizeEquipmentCost,
    discordGuildId: value.discordGuildId,
    extraRecipientDiscordIds: value.extraRecipientDiscordIds,
    notifyEvents: value.notifyEvents,
  }
}

function RanksBox() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const ranks = useQuery({ queryKey: ['ranks'], queryFn: () => api<{ items: { id: string; name: string; sortOrder: number }[] }>('/api/ranks') })
  return (
    <section className="panel stack" style={{ marginTop: 12 }}>
      <h2>Звания</h2>
      {ranks.data?.items.map((rank) => <div key={rank.id}>{rank.name}</div>)}
      <form className="row" onSubmit={(event) => {
        event.preventDefault()
        api('/api/ranks', { method: 'POST', body: JSON.stringify({ name, sortOrder: (ranks.data?.items.length ?? 0) + 1 }) })
          .then(async () => { setName(''); toast.success('Звание добавлено.'); await queryClient.invalidateQueries({ queryKey: ['ranks'] }) })
          .catch((error: Error) => toast.error(error.message))
      }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Новое звание" required />
        <Button>Добавить</Button>
      </form>
    </section>
  )
}

function RoleEditor(props: { roles: RoleRow[]; permissions: { key: string; description: string }[] }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [role, setRole] = useState<RoleRow | null>(null)
  const [perms, setPerms] = useState<string[]>([])
  return (
    <div className="panel">
      {props.roles.map((item) => <div key={item.id} className="row" style={{ justifyContent: 'space-between' }}><span>{item.name}</span><Button small onClick={() => { setRole(item); setPerms(item.permissions) }}>Права</Button></div>)}
      {role && <Modal title={role.name} onClose={() => setRole(null)}><div className="check-grid">{props.permissions.map((permission) => <label key={permission.key}><input type="checkbox" checked={perms.includes(permission.key)} onChange={(event) => setPerms(event.target.checked ? [...perms, permission.key] : perms.filter((key) => key !== permission.key))} /> {permission.description}</label>)}</div><Button onClick={() => api(`/api/admin/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify({ key: role.key, name: role.name, description: role.description, permissions: perms }) }).then(async () => { toast.success('Права роли обновлены.'); setRole(null); await queryClient.invalidateQueries() }).catch((error: Error) => toast.error(error.message))}>Сохранить</Button></Modal>}
    </div>
  )
}

interface PublishedRelease { version: string; notes: string; size: number; releasedAt: string }

function nextVersion(current: string | null): string {
  if (!current || !/^\d+\.\d+\.\d+$/.test(current)) return '1.0.1'
  const parts = current.split('.').map(Number)
  parts[2] = (parts[2] ?? 0) + 1
  return parts.join('.')
}

function readUploadError(body: string): string {
  try {
    const data = JSON.parse(body) as { error?: { message?: string } }
    return data.error?.message || 'Обновление не опубликовано.'
  } catch {
    return 'Обновление не опубликовано.'
  }
}

function ReleasePanel() {
  const toast = useToast()
  const auth = useAuth()
  const current = useQuery({ queryKey: ['release'], queryFn: () => api<{ release: PublishedRelease | null }>('/api/admin/release') })
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const shownVersion = version || nextVersion(current.data?.release?.version ?? null)
  async function publish() {
    if (!file) {
      toast.error('Выберите файл установщика .exe.')
      return
    }
    const token = await getToken()
    setPercent(0)
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_URL}/api/admin/release`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.setRequestHeader('Content-Type', 'application/octet-stream')
        xhr.setRequestHeader('X-MDT-Version', shownVersion)
        xhr.setRequestHeader('X-MDT-Notes', encodeURIComponent(notes))
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setPercent(Math.round((event.loaded / event.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(readUploadError(xhr.responseText)))
        }
        xhr.onerror = () => reject(new Error('Нет связи с архивом департамента.'))
        xhr.send(file)
      })
      toast.success('Обновление опубликовано. Открытые программы начнут загрузку.')
      setNotes('')
      setFile(null)
      setVersion('')
      await current.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Обновление не опубликовано.')
    } finally {
      setPercent(null)
    }
  }
  const published = current.data?.release
  return (
    <div className="panel stack">
      <p>Соберите установщик командой сборки Windows и отправьте его сюда. У всех, кто сейчас в программе, появится сообщение, файл скачается, и программа обновится. Кто был не в сети, получит его при следующем входе.</p>
      <p>{published ? `Сейчас на сервере версия ${published.version}.` : 'На сервере ещё нет опубликованной сборки. Первую версию сотрудники ставят вручную, следующие приходят сами.'}</p>
      <Field label="Версия"><input value={shownVersion} onChange={(event) => setVersion(event.target.value)} /></Field>
      <Field label="Что изменилось"><input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <input type="file" accept=".exe,application/octet-stream" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      {file && <p>{file.name}</p>}
      {percent !== null && <p>Отправка на сервер: {percent}%</p>}
      <Button disabled={!auth.online || percent !== null} onClick={() => void publish()}>Опубликовать обновление</Button>
    </div>
  )
}

function BackupPanel() {
  const toast = useToast()
  const auth = useAuth()
  const [fileName, setFileName] = useState('')
  const [backup, setBackup] = useState<unknown>(null)
  const [phrase, setPhrase] = useState('')
  return (
    <div className="panel stack">
      <p>Копия скачивается файлом JSON. Восстановление заменяет данные архива и требует фразы подтверждения. Журнал действий до восстановления сохраняется.</p>
      <Button onClick={() => api('/api/admin/backup').then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'mdt-backup.json'
        link.click()
        URL.revokeObjectURL(url)
        toast.success('Копия подготовлена.')
      }).catch((error: Error) => toast.error(error.message))}>Скачать копию</Button>
      <input type="file" accept="application/json" onChange={async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setFileName(file.name)
        try {
          setBackup(JSON.parse(await file.text()))
        } catch {
          setBackup(null)
          toast.error('Файл копии не разобран. Нужен файл архива, скачанный из этой панели.')
        }
      }} />
      {fileName && <Field label="Введите ВОССТАНОВИТЬ АРХИВ"><input value={phrase} onChange={(event) => setPhrase(event.target.value)} /></Field>}
      <Button danger disabled={!auth.online || phrase !== 'ВОССТАНОВИТЬ АРХИВ' || !backup} onClick={() => api<{ token: string }>('/api/admin/backup/restore', { method: 'POST', body: JSON.stringify({ confirmation: phrase, backup }) }).then(async (result) => {
        const { setToken } = await import('../api')
        await setToken(result.token)
        toast.success('Архив восстановлен. Страница обновится.')
        window.location.reload()
      }).catch((error: Error) => toast.error(error.message))}>Восстановить</Button>
      <Button ghost onClick={() => api('/api/admin/demo/archive', { method: 'POST' }).then(() => toast.success('Демонстрационные записи архивированы.')).catch((error: Error) => toast.error(error.message))}>Архивировать тестовые записи</Button>
    </div>
  )
}

interface PresenceRow {
  id: string
  discordId: string
  username: string
  name: string
  badgeNumber: string
  roles: string[]
  blocked: boolean
  accessGranted: boolean
  online: boolean
  activeSessions: number
  lastSeenAt: string | null
}

function DutyPanel() {
  const auth = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const presence = useQuery({
    queryKey: ['presence'],
    queryFn: () => api<{ items: PresenceRow[]; online: number }>('/api/admin/presence'),
    refetchInterval: 20000,
  })
  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['presence'] }) }
    window.addEventListener('mdt:presence', refresh)
    return () => window.removeEventListener('mdt:presence', refresh)
  }, [queryClient])
  const items = presence.data?.items ?? []
  return (
    <div className="grid-2">
      <div className="panel">
        <div className="panel-head">
          <h2>Кто в архиве</h2>
          <span className="pill ok">В сети {presence.data?.online ?? 0}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Сотрудник</th><th>Должность</th><th>Сессии</th><th>Последний сигнал</th><th>Статус</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}{item.badgeNumber ? ` · ${item.badgeNumber}` : ''}<div className="muted">{item.username}</div></td>
                  <td>{item.roles.join(', ') || '—'}</td>
                  <td>{item.activeSessions}</td>
                  <td>{when(item.lastSeenAt)}</td>
                  <td>{item.online ? <span className="pill ok">В сети</span> : item.blocked ? <span className="pill danger">Блок</span> : !item.accessGranted ? <span className="pill warn">Нет доступа</span> : <span className="pill">Не в сети</span>}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={5}>Пока никто не входил в архив.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <form className="panel stack" onSubmit={(event) => {
        event.preventDefault()
        const text = message.trim()
        if (text.length < 3) return
        void confirm({ title: 'Оповещение всем в приложении', body: text }).then((answer) => {
          if (!answer.ok) return
          api('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ message: text }) })
            .then(async () => {
              setMessage('')
              if (!auth.live) playAlert()
              toast.success('Оповещение отправлено. У кого открыт архив, прозвучит сигнал.')
              await queryClient.invalidateQueries({ queryKey: ['notifications'] })
            })
            .catch((error: Error) => toast.error(error.message))
        })
      }}>
        <h2>Оповещение</h2>
        <p className="muted">Текст увидят все, у кого сейчас открыт архив. Прозвучит сигнал. Кто был не в сети, увидит его на главной при следующем входе.</p>
        <Field label="Текст оповещения">
          <textarea value={message} maxLength={400} onChange={(event) => setMessage(event.target.value)} placeholder="Сбор у офиса шерифа через десять минут." />
        </Field>
        <Button disabled={!auth.online || message.trim().length < 3}>Отправить всем</Button>
      </form>
    </div>
  )
}
