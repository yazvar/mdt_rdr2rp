import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { API_URL, api } from './api'
import { can, useAuth } from './auth'
import { Button, Star } from './ui'

const links = [
  { to: '/', label: 'Главная', end: true, icon: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z' },
  { to: '/employees', label: 'Сотрудники', perm: 'personnel.view', icon: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3.5 3.5 0 0 0-2.5-3.3M16.5 5.2a3 3 0 0 1 0 5.6' },
  { to: '/citizens', label: 'Граждане', perm: 'citizens.view', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20a7 7 0 0 1 14 0' },
  { to: '/laws', label: 'Законы', perm: 'laws.view', icon: 'M6 5h9a3 3 0 0 1 3 3v11H9a3 3 0 0 0-3 3zM6 5v14' },
  { to: '/wanted', label: 'Розыск', perm: 'wanted.view', icon: 'M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11zM12 11.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z' },
  { to: '/fines', label: 'Штрафы', perm: 'fines.view', icon: 'M7 4h10v16l-2.2-1.4L12.5 20l-2.3-1.4L8 20l-1-16zM9 8h6M9 12h6' },
  { to: '/seizures', label: 'Конфискат', perm: 'seizure.view', icon: 'M4 8h16v11H4zM8 8V6a4 4 0 0 1 8 0v2' },
  { to: '/armory', label: 'Оружие', perm: 'armory.view_own', icon: 'M12 3 5 6v6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6z' },
  { to: '/losses', label: 'Утери', perm: 'loss.view_own', icon: 'M12 4 4 8l8 4 8-4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4' },
  { to: '/requests', label: 'Запросы', perm: 'requests.create', icon: 'M5 6h14v12H5zM5 10h14M9 6V4h6v2' },
  { to: '/accounting', label: 'Казна', perm: 'accounting.view', icon: 'M12 4v16M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.8 0-4.5 1.3-4.5 3S9.2 11.5 12 11.5s4.5 1.2 4.5 3-1.7 3-4.5 3c-2.1 0-3.7-.8-4.5-2' },
  { to: '/audit', label: 'Журнал', perm: 'audit.view', icon: 'M8 6h11M8 12h11M8 18h11M5 6h.01M5 12h.01M5 18h.01' },
  { to: '/admin', label: 'Настройки', perm: 'admin.access', icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 3.5v2.2M12 18.3v2.2M4.8 6.2l1.6 1.6M17.6 16.2l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.8l1.6-1.6M17.6 7.8l1.6-1.6' },
]

function Glyph(props: { d: string }) {
  return (
    <svg className="nav-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d={props.d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface SearchHit { id: string; label: string; hint: string; to: string }

export function Shell(props: { children: React.ReactNode }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [now, setNow] = useState(() => new Date())
  const user = auth.user
  const visible = links.filter((link) => !link.perm || can(user, link.perm))
  const person = user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user?.globalName || user?.username

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    const timer = setTimeout(() => {
      api<{ employees: { id: string; firstName: string; lastName: string; badgeNumber: string }[]; citizens?: { id: string; firstName: string; lastName: string; alias: string }[]; wanted: { id: string; caseNumber: string; firstName: string; lastName: string }[]; fines: { id: string; fineNumber: string; offenderFirstName: string; offenderLastName: string }[]; seizures: { id: string; caseNumber: string; suspectFirstName: string; suspectLastName: string }[]; laws: { id: string; articleNumber: string; title: string }[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((result) => {
          const next: SearchHit[] = [
            ...(result.citizens ?? []).map((item) => ({ id: item.id, label: `${item.lastName} ${item.firstName}`, hint: item.alias ? `Гражданин · ${item.alias}` : 'Гражданин', to: `/citizens?open=${item.id}` })),
            ...result.employees.map((item) => ({ id: item.id, label: `${item.lastName} ${item.firstName}`, hint: `Сотрудник · ${item.badgeNumber}`, to: `/employees?open=${item.id}` })),
            ...result.wanted.map((item) => ({ id: item.id, label: `${item.lastName} ${item.firstName}`, hint: item.caseNumber, to: `/wanted?open=${item.id}` })),
            ...result.fines.map((item) => ({ id: item.id, label: `${item.offenderLastName} ${item.offenderFirstName}`, hint: item.fineNumber, to: `/fines?open=${item.id}` })),
            ...result.seizures.map((item) => ({ id: item.id, label: `${item.suspectLastName} ${item.suspectFirstName}`, hint: item.caseNumber, to: `/seizures?open=${item.id}` })),
            ...result.laws.map((item) => ({ id: item.id, label: item.title, hint: item.articleNumber, to: `/laws?open=${item.id}` })),
          ]
          setHits(next)
        })
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Star />
          <strong>SHERIFF</strong>
          <span>{auth.department?.county || 'Округ'} MDT</span>
        </div>
        <nav className="nav">
          {visible.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}><Glyph d={link.icon} /><span>{link.label}</span></NavLink>
          ))}
        </nav>
        <div className="side-scene" aria-hidden="true">
          <svg viewBox="0 0 120 90">
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1b2433" />
                <stop offset="55%" stopColor="#8a5a32" />
                <stop offset="100%" stopColor="#c9864a" />
              </linearGradient>
            </defs>
            <rect width="120" height="90" fill="url(#sky)" />
            <path fill="#2a211c" d="M0 58 18 40l14 12 16-22 20 18 12-10 18 16 22-20v56H0z" />
            <path fill="#14110f" d="M0 70c18-8 28 4 46-2s24 8 40 0 20 6 34-4v26H0z" />
            <circle cx="78" cy="28" r="7" fill="#f0c27a" opacity="0.85" />
          </svg>
          <p>ДОЛГ<br />ЧЕСТЬ<br />ЗАКОН</p>
        </div>
        <button className="power" type="button" title="Выйти" onClick={() => auth.logout()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9M7.2 6.2a7 7 0 1 0 9.6 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        </button>
      </aside>
      <section className="main">
        <header className="topbar">
          <div className="clock">
            <b>{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</b>
            <span>{now.toLocaleDateString('ru-RU')}</span>
          </div>
          <div className="search">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск по гражданам, делам, статье" aria-label="Глобальный поиск" />
            {hits.length > 0 && (
              <div className="search-pop">
                {hits.map((hit) => (
                  <button key={hit.to} type="button" onClick={() => { setQ(''); setHits([]); navigate(hit.to) }}>
                    {hit.label} <small>{hit.hint}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="userchip">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="avatar-fallback">{person?.slice(0, 1)}</span>}
            <div>
              <strong>{person}</strong>
              <div className="muted">{auth.department?.name}</div>
              <div className="shift"><span className={`dot ${auth.online ? 'on' : ''}`} />{auth.online ? 'На смене' : 'Нет связи'}</div>
            </div>
          </div>
        </header>
        <div className="content">
          {!auth.online && <div className="banner">Связь с архивом прервана. Запись не будет считаться сохранённой, пока сервер не подтвердит операцию.</div>}
          {auth.department?.demoSeeded && <div className="banner demo">В архиве есть демонстрационные записи с пометкой ТЕСТ. Перед службой их нужно архивировать в администрации.</div>}
          <UpdateBanner />
          {props.children}
        </div>
      </section>
    </div>
  )
}

interface UpdateStatus { state: string; version?: string; percent?: number; message?: string }

function UpdateBanner() {
  const auth = useAuth()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [hold, setHold] = useState(false)
  const [left, setLeft] = useState(20)
  const installing = useRef(false)
  useEffect(() => {
    if (!window.mdt?.onUpdate) return
    return window.mdt.onUpdate((next) => {
      installing.current = false
      setHold(false)
      setLeft(20)
      setStatus(next)
    })
  }, [])
  useEffect(() => {
    if (!auth.user || !window.mdt?.checkForUpdates) return
    void window.mdt.checkForUpdates(API_URL).then((result) => {
      if (result.error) setStatus({ state: 'error', message: result.error })
    })
  }, [auth.user, auth.releasePulse])
  useEffect(() => {
    if (status?.state !== 'ready' || hold) return
    const timer = window.setInterval(() => setLeft((value) => (value > 0 ? value - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [status?.state, status?.version, hold])
  useEffect(() => {
    if (status?.state !== 'ready' || hold || left > 0 || installing.current) return
    installing.current = true
    void window.mdt?.installUpdate()
  }, [status, hold, left])
  if (!status || status.state === 'idle') return null
  if (status.state === 'error') return <div className="banner">{status.message}</div>
  if (status.state === 'ready') {
    return (
      <div className="banner demo">
        {hold
          ? `Обновление ${status.version} загружено. Оно установится, когда вы закроете программу.`
          : `Обновление ${status.version} загружено. Программа обновится через ${left} с.`}
        <span className="row" style={{ marginTop: 8 }}>
          <Button small onClick={() => { setHold(false); setLeft(0) }}>Обновить сейчас</Button>
          {!hold && <Button ghost small onClick={() => setHold(true)}>Позже</Button>}
        </span>
      </div>
    )
  }
  const percent = status.state === 'downloading' ? ` ${status.percent ?? 0}%` : ''
  return <div className="banner demo">Доступно обновление {status.version}. Загрузка{percent}. После неё программа перезапустится.</div>
}

export function Login() {
  const auth = useAuth()
  const [personas, setPersonas] = useState<{ discordId: string; name: string; roles: string[] }[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!auth.config?.devLogin) return
    api<{ items: { discordId: string; name: string; roles: string[] }[] }>('/api/auth/dev-personas').then((result) => setPersonas(result.items)).catch(() => setPersonas([]))
  }, [auth.config?.devLogin])
  return (
    <div className="login-screen">
      <div className="warrant">
        <Star />
        <p className="kicker">{auth.config?.countyName ?? 'Округ'}</p>
        <h1>{auth.config?.departmentName ?? 'Шерифский департамент'}</h1>
        <p className="motto">{auth.config?.motto || 'Закон и порядок'}</p>
        <div className="stack">
          <Button disabled={pending || !auth.config?.discordConfigured} onClick={() => {
            setPending(true); setError('')
            auth.loginDiscord().catch((reason: Error) => setError(reason.message)).finally(() => setPending(false))
          }}>{pending ? 'Ожидаем Discord…' : 'Войти через Discord'}</Button>
          {!auth.config && <p>Архив департамента сейчас недоступен. Проверьте связь с сервером.</p>}
          {auth.config && !auth.config.discordConfigured && <p>Вход через Discord на сервере ещё не настроен.</p>}
          {error && <p>{error}</p>}
          {auth.config?.devLogin && personas.length > 0 && (
            <div className="stack">
              <p className="kicker">Только локальная проверка</p>
              {personas.map((persona) => (
                <Button ghost key={persona.discordId} onClick={() => auth.loginDev(persona.discordId).catch((reason: Error) => setError(reason.message))}>
                  {persona.name} — {persona.roles.join(', ')}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
