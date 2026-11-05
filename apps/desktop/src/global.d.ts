/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    mdt?: {
      getToken: () => Promise<string>
      setToken: (token: string) => Promise<void>
      clearToken: () => Promise<void>
      openExternal: (url: string) => Promise<boolean>
      appVersion: () => Promise<string>
      checkForUpdates: (apiBase: string) => Promise<{ supported: boolean; current?: string; error?: string }>
      installUpdate: () => Promise<boolean>
      onUpdate: (callback: (status: { state: string; version?: string; percent?: number; message?: string }) => void) => () => void
    }
  }
}
