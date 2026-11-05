export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export async function getToken(): Promise<string> {
  if (window.mdt) return window.mdt.getToken()
  return localStorage.getItem('mdt-token') ?? ''
}

export async function setToken(token: string): Promise<void> {
  if (window.mdt) await window.mdt.setToken(token)
  else localStorage.setItem('mdt-token', token)
}

export async function clearToken(): Promise<void> {
  if (window.mdt) await window.mdt.clearToken()
  else localStorage.removeItem('mdt-token')
}

export async function openExternal(url: string): Promise<void> {
  if (window.mdt) {
    await window.mdt.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Нет связи с архивом департамента. Запись не сохранена.')
  }
  const text = await response.text()
  const data = text ? safeJson(text) : null
  const publicAuth = path.includes('/auth/discord/') || path.includes('/auth/config') || path.includes('/auth/dev-')
  if (response.status === 401 && !publicAuth) {
    await clearToken()
    window.dispatchEvent(new Event('mdt:unauthorized'))
  }
  if (!response.ok) {
    const error = data as { error?: { code?: string; message?: string; details?: unknown } } | null
    throw new ApiError(response.status, error?.error?.code ?? 'ERROR', error?.error?.message ?? 'Операция не выполнена.', error?.error?.details)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { error: { message: text } }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
