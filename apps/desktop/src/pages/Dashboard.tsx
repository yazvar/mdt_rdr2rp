import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { can, useAuth } from '../auth'
import { actionText, money, when } from '../format'
import { Status } from '../ui'

interface Dashboard {
  employees: { active: number; suspended: number; onLeave: number } | null
  wanted: { id: string; caseNumber: string; firstName: string; lastName: string; wantedLevel: number; photo: string }[] | null
  cases: { id: string; caseNumber: string; title: string; status: string; suspectFirstName: string; suspectLastName: string }[] | null
  seizures: { id: string; caseNumber: string; suspectFirstName: string; suspectLastName: string; propertyStatus: string }[] | null
  requests: { id: string; requestNumber: string; requesterName: string; itemName: string; serialNumber: string | null; quantity: number; status: string }[]
  fines: { id: string; fineNumber: string; offenderFirstName: string; offenderLastName: string; amountCents: number; paymentStatus: string }[] | null
  activity: { id: string; actorName: string; action: string; module: string; createdAt: string }[]
  notifications: { id: string; title: string; body: string; createdAt: string; readAt: string | null }[]
  unread: number
}

interface Crew { id: string; firstName: string; lastName: string; badgeNumber: string; rank: string; status: string }

const dot: Record<string, string> = {
  pending: 'amber',
  approved: 'green',
  issued: 'green',
  registered: 'green',
  rejected: 'red',
  closed: 'blue',
  active: 'green',
  suspended: 'red',
  on_leave: 'amber',
  investigating: 'amber',
  unpaid: 'red',
  partial: 'amber',
  paid: 'green',
}

export function DashboardPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/api/dashboard') })
  const crew = useQuery({
    queryKey: ['dash-crew'],
    enabled: can(auth.user, 'personnel.view'),
    queryFn: () => api<{ items: Crew[] }>('/api/employees?pageSize=6&status=active'),
  })
  const data = query.data
  const people = useQuery({
    queryKey: ['dash-citizens'],
    enabled: can(auth.user, 'citizens.view'),
    queryFn: () => api<{ items: { id: string; firstName: string; lastName: string; alias: string; residence: string }[] }>('/api/citizens?pageSize=6'),
  })
  return (
    <div className="board">
      {query.isError && <div className="banner board-span">{(query.error as Error).message}</div>}
      <section className="panel feed">
        <div className="panel-head">
          <h2>Граждане <span className="count">{people.data?.items.length ?? 0}</span></h2>
          <button type="button" className="text-link" onClick={() => navigate('/citizens')}>Все</button>
        </div>
        <div className="feed-list">
          {people.data?.items.map((item) => (
            <button key={item.id} type="button" className="feed-row" onClick={() => navigate(`/citizens?open=${item.id}`)}>
              <i className="bullet" />
              <span>
                <strong>{item.lastName} {item.firstName}</strong>
                <small>{item.alias || item.residence || 'Картотека'}</small>
              </span>
            </button>
          ))}
          {people.data && !people.data.items.length && <div className="muted">Картотека пуста.</div>}
          {!can(auth.user, 'citizens.view') && <div className="muted">Картотека граждан вам недоступна.</div>}
        </div>
      </section>
      <section className="panel feed">
        <div className="panel-head">
          <h2>Реестр <span className="count">{data?.requests.length ?? 0}</span></h2>
          <button type="button" className="text-link" onClick={() => navigate('/requests')}>Все</button>
        </div>
        <div className="feed-list">
          {data?.requests.slice(0, 6).map((item) => (
            <button key={item.id} type="button" className="feed-row" onClick={() => navigate('/requests')}>
              <i className={`bullet ${dot[item.status] ?? 'blue'}`} />
              <span>
                <strong>{item.itemName}</strong>
                <small>{item.requesterName}{item.serialNumber ? ` · ${item.serialNumber}` : ''}</small>
              </span>
              <Status code={item.status} />
            </button>
          ))}
          {data && !data.requests.length && <div className="muted">Реестр вооружения пуст.</div>}
        </div>
      </section>
      <section className="panel feed">
        <div className="panel-head">
          <h2>На службе</h2>
          <button type="button" className="text-link" onClick={() => navigate('/employees')}>Все</button>
        </div>
        <div className="feed-list">
          {crew.data?.items.map((item) => (
            <button key={item.id} type="button" className="feed-row" onClick={() => navigate(`/employees?open=${item.id}`)}>
              <i className={`bullet ${dot[item.status] ?? 'green'}`} />
              <span>
                <strong>{item.lastName} {item.firstName}</strong>
                <small>{item.rank || 'Сотрудник'} · {item.badgeNumber}</small>
              </span>
            </button>
          ))}
          {!crew.data && data?.employees && (
            <>
              <div className="feed-row"><i className="bullet green" /><span><strong>На службе</strong><small>{data.employees.active}</small></span></div>
              <div className="feed-row"><i className="bullet red" /><span><strong>Отстранены</strong><small>{data.employees.suspended}</small></span></div>
              <div className="feed-row"><i className="bullet amber" /><span><strong>В отпуске</strong><small>{data.employees.onLeave}</small></span></div>
            </>
          )}
          {crew.data && !crew.data.items.length && <div className="muted">На службе никого нет.</div>}
        </div>
      </section>
      <section className="panel feed">
        <div className="panel-head">
          <h2>Последние дела</h2>
          <button type="button" className="text-link" onClick={() => navigate(data?.cases ? '/cases' : '/seizures')}>Все</button>
        </div>
        <div className="feed-list">
          {data?.cases?.slice(0, 4).map((item) => (
            <button key={item.id} type="button" className="feed-row" onClick={() => navigate(`/cases?open=${item.id}`)}>
              <span>
                <strong>{item.caseNumber}</strong>
                <small>{item.title}</small>
              </span>
              <Status code={item.status} />
            </button>
          ))}
          {!data?.cases?.length && data?.seizures?.slice(0, 4).map((item) => (
            <button key={item.id} type="button" className="feed-row" onClick={() => navigate(`/seizures?open=${item.id}`)}>
              <span>
                <strong>{item.caseNumber}</strong>
                <small>{item.suspectLastName} {item.suspectFirstName}</small>
              </span>
              <Status code={item.propertyStatus} />
            </button>
          ))}
          {data?.fines?.slice(0, 2).map((item) => (
            <button key={item.id} type="button" className="feed-row" onClick={() => navigate(`/fines?open=${item.id}`)}>
              <span>
                <strong>{item.fineNumber}</strong>
                <small>{item.offenderLastName} · {money(item.amountCents, auth.department?.currencySymbol)}</small>
              </span>
              <Status code={item.paymentStatus} />
            </button>
          ))}
          {data && !data.cases?.length && !data.seizures?.length && !data.fines?.length && <div className="muted">Дел пока нет.</div>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Розыск</h2>
          <button type="button" className="text-link" onClick={() => navigate('/wanted')}>Все</button>
        </div>
        <div className="posters">
          {data?.wanted?.slice(0, 3).map((item) => (
            <button key={item.id} type="button" className="poster" onClick={() => navigate(`/wanted?open=${item.id}`)}>
              <b>WANTED</b>
              <span className="poster-face">{item.photo ? <img src={item.photo} alt="" /> : `${item.lastName.slice(0, 1)}${item.firstName.slice(0, 1)}`}</span>
              <strong>{item.lastName}</strong>
              <em>{item.firstName}</em>
              <small>уровень {item.wantedLevel}</small>
            </button>
          ))}
          {data?.wanted && !data.wanted.length && <div className="muted">Активных объявлений нет.</div>}
        </div>
      </section>
      <section className="panel feed">
        <div className="panel-head">
          <h2>Последние записи</h2>
          <button type="button" className="text-link" onClick={() => navigate('/audit')}>Все</button>
        </div>
        <div className="feed-list">
          {data?.activity.slice(0, 5).map((item) => (
            <div className="feed-row" key={item.id}>
              <span>
                <strong>{actionText(item.action)}</strong>
                <small>{item.actorName || 'Система'} · {when(item.createdAt)}</small>
              </span>
            </div>
          ))}
          {data?.notifications.slice(0, 2).map((item) => (
            <div className="feed-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
              </span>
            </div>
          ))}
          {!data?.activity.length && !data?.notifications.length && <div className="muted">Журнал пока пуст.</div>}
        </div>
      </section>
    </div>
  )
}
