import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import type { PublicUser } from '@mdt/shared'
import { API_URL, ApiError, api, clearToken, getToken, openExternal, setToken, sleep } from './api'

interface Department {
  name: string
  county: string
  motto: string
  currencySymbol: string
  currencyCode: string
  demoSeeded: boolean
}

interface Config {
  departmentName: string
  countyName: string
  motto: string
  discordConfigured: boolean
  devLogin: boolean
}

interface AuthValue {
  user: PublicUser | null
  department: Department | null
  config: Config | null
  loading: boolean
  online: boolean
  live: boolean
  releasePulse: number
  loginDiscord: () => Promise<void>
  loginDev: (discordId: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('auth')
  return value
}

export function can(user: PublicUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission))
}

export function AuthProvider(props: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<PublicUser | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(true)
  const [live, setLive] = useState(false)
  const [releasePulse, setReleasePulse] = useState(0)

  async function refresh() {
    const token = await getToken()
    if (!token) {
      setUser(null)
      setDepartment(null)
      return
    }
    const me = await api<{ user: PublicUser; department: Department; sessionExpiresAt: string }>('/api/auth/me')
    setUser(me.user)
    setDepartment(me.department)
    const expires = new Date(me.sessionExpiresAt).getTime()
    if (expires - Date.now() < 2 * 60 * 60_000) {
      const rotated = await api<{ token: string }>('/api/auth/refresh', { method: 'POST' })
      await setToken(rotated.token)
    }
  }

  useEffect(() => {
    api<Config>('/api/auth/config').then(setConfig).catch(() => setConfig(null))
    refresh().catch(() => setUser(null)).finally(() => setLoading(false))
    const onDenied = () => { setUser(null); queryClient.clear() }
    window.addEventListener('mdt:unauthorized', onDenied)
    return () => window.removeEventListener('mdt:unauthorized', onDenied)
  }, [queryClient])

  useEffect(() => {
    if (!user) return
    let cursor = 0
    let socket: Socket | null = null
    let closed = false
    void getToken().then((token) => {
      socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] })
      socket.on('connect', () => setLive(true))
      socket.on('disconnect', () => setLive(false))
      const changed = () => { void queryClient.invalidateQueries() }
      socket.on('mdt:change', changed)
      socket.on('mdt:notification', changed)
      socket.on('mdt:release', () => { if (!closed) setReleasePulse((value) => value + 1) })
    })
    const timer = setInterval(() => {
      api('/api/health').then(() => { if (!closed) setOnline(true) }).catch(() => { if (!closed) setOnline(false) })
      api<{ events: unknown[]; latest: number }>(`/api/sync?after=${cursor}`)
        .then((sync) => {
          cursor = sync.latest
          if (sync.events.length) void queryClient.invalidateQueries()
        })
        .catch(() => { if (!closed) setOnline(false) })
    }, 12000)
    return () => { closed = true; socket?.close(); clearInterval(timer); setLive(false) }
  }, [user, queryClient])

  async function loginDiscord() {
    const start = await api<{ attemptId: string; authorizationUrl: string }>('/api/auth/discord/start', { method: 'POST' })
    await openExternal(start.authorizationUrl)
    const deadline = Date.now() + 5 * 60_000
    while (Date.now() < deadline) {
      await sleep(1200)
      const poll = await api<{ status: string; token?: string; message?: string }>(`/api/auth/discord/poll/${start.attemptId}`)
      if (poll.status === 'ready' && poll.token) {
        await setToken(poll.token)
        await refresh()
        return
      }
      if (poll.status === 'denied' || poll.status === 'expired') {
        throw new ApiError(403, poll.status, poll.message || 'Вход не разрешён.')
      }
    }
    throw new ApiError(408, 'TIMEOUT', 'Время входа истекло. Начните снова.')
  }

  async function loginDev(discordId: string) {
    const result = await api<{ token: string }>('/api/auth/dev-login', { method: 'POST', body: JSON.stringify({ discordId }) })
    await setToken(result.token)
    await refresh()
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    await clearToken()
    setUser(null)
    queryClient.clear()
  }

  return (
    <AuthContext.Provider value={{ user, department, config, loading, online, live, releasePulse, loginDiscord, loginDev, logout }}>
      {props.children}
    </AuthContext.Provider>
  )
}
