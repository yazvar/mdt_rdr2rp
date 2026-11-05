import { createContext, useContext, useState, type FormEvent, type ReactNode } from 'react'
import { statusText, statusTone } from './format'

export function Star() {
  return (
    <svg className="star" viewBox="0 0 64 64" aria-hidden="true">
      <polygon fill="#e6c98a" points="32,4 38.5,23 58,23 42.2,35 48,54 32,43 16,54 21.8,35 6,23 25.5,23" />
    </svg>
  )
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { ghost?: boolean; danger?: boolean; small?: boolean }) {
  const { ghost, danger, small, className = '', ...rest } = props
  return <button className={`btn ${ghost ? 'ghost' : ''} ${danger ? 'danger' : ''} ${small ? 'small' : ''} ${className}`} {...rest} />
}

export function Field(props: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${props.wide ? 'wide' : ''}`}>
      <span>{props.label}</span>
      {props.children}
    </label>
  )
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-back" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{props.title}</h2>
          <Button ghost small type="button" onClick={props.onClose}>Закрыть</Button>
        </div>
        <div style={{ marginTop: 12 }}>{props.children}</div>
      </div>
    </div>
  )
}

export function Pager(props: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize))
  return (
    <div className="pager">
      <span>Записи {props.total}. Страница {props.page} из {pages}</span>
      <span className="row">
        <Button ghost small type="button" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>Назад</Button>
        <Button ghost small type="button" disabled={props.page >= pages} onClick={() => props.onPage(props.page + 1)}>Дальше</Button>
      </span>
    </div>
  )
}

export function Status(props: { code?: string | null }) {
  return <span className={`pill ${statusTone(props.code)}`}>{statusText(props.code)}</span>
}

export function Empty(props: { text: string }) {
  return <div className="empty">{props.text}</div>
}

export function CopyButton(props: { value: string }) {
  return (
    <Button ghost small type="button" onClick={() => navigator.clipboard.writeText(props.value)}>
      {props.value}
    </Button>
  )
}

type Toast = { id: number; text: string; error?: boolean }
const ToastContext = createContext<{ push: (text: string, error?: boolean) => void }>({ push: () => undefined })

export function useToast() {
  const ctx = useContext(ToastContext)
  return {
    success: (text: string) => ctx.push(text),
    error: (text: string) => ctx.push(text, true),
  }
}

type ConfirmRequest = {
  title: string
  body: string
  danger?: boolean
  reason?: boolean
  resolve: (value: { ok: boolean; reason: string }) => void
}

const ConfirmContext = createContext<(input: Omit<ConfirmRequest, 'resolve'>) => Promise<{ ok: boolean; reason: string }>>(async () => ({ ok: false, reason: '' }))

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function Feedback(props: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [reason, setReason] = useState('')
  return (
    <ToastContext.Provider value={{ push: (text, error) => {
      const id = Date.now() + Math.random()
      setToasts((items) => [...items, { id, text, error }])
      setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200)
    } }}>
      <ConfirmContext.Provider value={(input) => new Promise((resolve) => { setReason(''); setConfirm({ ...input, resolve }) })}>
        {props.children}
        <div className="toast-wrap">
          {toasts.map((toast) => <div key={toast.id} className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>)}
        </div>
        {confirm && (
          <div className="modal-back confirm-back">
            <form className="modal" style={{ width: 460 }} onSubmit={(event: FormEvent) => {
              event.preventDefault()
              if (confirm.reason && reason.trim().length < 3) return
              confirm.resolve({ ok: true, reason })
              setConfirm(null)
            }}>
              <h2 style={{ marginTop: 0 }}>{confirm.title}</h2>
              <p>{confirm.body}</p>
              {confirm.reason && <Field label="Причина"><input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} /></Field>}
              <div className="row" style={{ marginTop: 12 }}>
                <Button type="submit" danger={confirm.danger}>Подтвердить</Button>
                <Button ghost type="button" onClick={() => { confirm.resolve({ ok: false, reason: '' }); setConfirm(null) }}>Отмена</Button>
              </div>
            </form>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  )
}
