import { gradeLabel, gradeMark, totalsError, type SentenceBounds } from '@mdt/shared'
import { money } from './format'

export interface ChargeLaw extends SentenceBounds {
  id: string
  title: string
  grade: string
  additionalPenalties: string
  status: string
  isDemo?: boolean
}

export interface ChargeChoice {
  lawId: string
  fineCents: number
  jailDays: number
}

const order = ['i', 'm', 'f']

export function PunishmentPicker(props: { laws: ChargeLaw[]; value: ChargeChoice[]; onChange: (value: ChargeChoice[]) => void; symbol?: string }) {
  const symbol = props.symbol || '$'
  const usable = props.laws.filter((law) => law.status === 'active' && !law.isDemo && (law.fineCents > 0 || law.jailDays > 0 || law.fineMinCents > 0 || law.jailMin > 0))
  const chosen = new Map(props.value.map((item) => [item.lawId, item]))
  const fine = props.value.reduce((sum, item) => sum + item.fineCents, 0)
  const jail = props.value.reduce((sum, item) => sum + item.jailDays, 0)
  const cap = totalsError(fine, jail)
  function toggle(law: ChargeLaw, on: boolean) {
    if (!on) {
      props.onChange(props.value.filter((item) => item.lawId !== law.id))
      return
    }
    props.onChange([...props.value, { lawId: law.id, fineCents: law.fineMinCents, jailDays: law.jailMin }])
  }
  function slide(lawId: string, patch: Partial<ChargeChoice>) {
    props.onChange(props.value.map((item) => (item.lawId === lawId ? { ...item, ...patch } : item)))
  }
  return (
    <div className="sentence">
      {order.map((grade) => {
        const group = usable.filter((law) => law.grade === grade)
        if (!group.length) return null
        return (
          <section key={grade}>
            <h3>{gradeMark(grade)} {gradeLabel(grade)}</h3>
            <div className="sentence-list">
              {group.map((law) => {
                const pick = chosen.get(law.id)
                return (
                  <div className={pick ? 'sentence-row on' : 'sentence-row'} key={law.id}>
                    <label className="sentence-title">
                      <input type="checkbox" checked={Boolean(pick)} onChange={(event) => toggle(law, event.target.checked)} />
                      <span><b>{law.articleNumber}</b> {law.title}</span>
                    </label>
                    <div className="muted">{rangeMoney(law, symbol)} · {rangeTerms(law)}{law.additionalPenalties ? ` · ${law.additionalPenalties}` : ''}</div>
                    {pick && (
                      <div className="sentence-sliders">
                        {law.fineCents > 0 && <Slider label="Штраф" min={law.fineMinCents} max={law.fineCents} step={100} value={pick.fineCents} text={money(pick.fineCents, symbol)} onChange={(value) => slide(law.id, { fineCents: value })} />}
                        {law.jailDays > 0 && <Slider label="Срок" min={law.jailMin} max={law.jailDays} step={1} value={pick.jailDays} text={termText(pick.jailDays)} onChange={(value) => slide(law.id, { jailDays: value })} />}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
      {!usable.length && <div className="muted">В своде нет статей с наказанием.</div>}
      <div className={cap ? 'notice bad' : 'notice'}>
        Итого: {money(fine, symbol)}, {termText(jail)}. По своду не больше 750$ и 60 сроков. Покушение, если статья не говорит иное, сокращает срок на треть.
        {cap && <div>{cap}</div>}
      </div>
    </div>
  )
}

function Slider(props: { label: string; min: number; max: number; step: number; value: number; text: string; onChange: (value: number) => void }) {
  if (props.min === props.max) return <div className="sentence-fixed">{props.label}: {props.text}</div>
  return (
    <label className="sentence-slider">
      <span>{props.label}: {props.text}</span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  )
}

function rangeMoney(law: SentenceBounds, symbol: string) {
  if (!law.fineMinCents && !law.fineCents) return 'без штрафа'
  if (law.fineMinCents === law.fineCents) return money(law.fineCents, symbol)
  return `${money(law.fineMinCents, symbol)}–${money(law.fineCents, symbol)}`
}

function rangeTerms(law: SentenceBounds) {
  if (!law.jailMin && !law.jailDays) return 'без срока'
  if (law.jailMin === law.jailDays) return termText(law.jailDays)
  return `${law.jailMin}–${law.jailDays} сроков`
}

function termText(value: number) {
  const n = Math.abs(Math.trunc(value))
  const mod10 = n % 10
  const mod100 = n % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'срок' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'срока' : 'сроков'
  return `${n} ${word}`
}
