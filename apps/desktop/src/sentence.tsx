import { useState } from 'react'
import { gradeLabel, gradeMark, totalsError } from '@mdt/shared'
import { articleMatchesQuery, rangeMoney, rangeTerms, termText } from './articleSearch'
import { money } from './format'

export interface ChargeLaw {
  id: string
  articleNumber: string
  title: string
  grade: string
  description?: string
  conditions?: string
  additionalPenalties: string
  fineMinCents: number
  fineCents: number
  jailMin: number
  jailDays: number
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
  const [query, setQuery] = useState('')
  const usable = props.laws.filter((law) => law.status === 'active' && !law.isDemo && (law.fineCents > 0 || law.jailDays > 0 || law.fineMinCents > 0 || law.jailMin > 0))
  const chosen = new Map(props.value.map((item) => [item.lawId, item]))
  const fine = props.value.reduce((sum, item) => sum + item.fineCents, 0)
  const jail = props.value.reduce((sum, item) => sum + item.jailDays, 0)
  const cap = totalsError(fine, jail)
  const visible = (law: ChargeLaw) => chosen.has(law.id) || articleMatchesQuery(law, query, symbol)
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
  const anyVisible = usable.some(visible)
  return (
    <div className="sentence">
      <label className="sentence-search">
        <span>Найти статью</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }}
          placeholder="Номер, название или наказание"
          aria-label="Поиск статьи"
          autoComplete="off"
        />
      </label>
      {order.map((grade) => {
        const group = usable.filter((law) => law.grade === grade && visible(law))
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
      {usable.length > 0 && !anyVisible && <div className="muted">По этому запросу статей нет.</div>}
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

