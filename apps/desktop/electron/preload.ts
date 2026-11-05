import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('mdt', {
  getToken: (): Promise<string> => ipcRenderer.invoke('token:get'),
  setToken: (token: string): Promise<void> => ipcRenderer.invoke('token:set', token),
  clearToken: (): Promise<void> => ipcRenderer.invoke('token:clear'),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:open', url),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  checkForUpdates: (apiBase: string): Promise<{ supported: boolean; current?: string; error?: string }> => ipcRenderer.invoke('update:check', apiBase),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
  onUpdate: (callback: (status: { state: string; version?: string; percent?: number; message?: string }) => void): (() => void) => {
    const listener = (_event: unknown, payload: { state: string; version?: string; percent?: number; message?: string }) => callback(payload)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
})
