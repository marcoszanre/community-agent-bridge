import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { AppStage, ConnectionStatus, LogEntry } from '@/types'

interface AppState {
  // Stage navigation
  stage: AppStage
  setStage: (stage: AppStage) => void
  setCurrentStage: (stage: AppStage) => void  // Alias for setStage
  
  // Connection status
  connectionStatus: ConnectionStatus
  setConnectionStatus: (status: ConnectionStatus) => void
  
  // Error handling
  error: string | null
  setError: (error: string | null) => void
  
  // Logs
  logs: LogEntry[]
  addLog: (message: string, type: LogEntry['type']) => void
  clearLogs: () => void
  
  // UI state
  isLogsExpanded: boolean
  toggleLogs: () => void
}

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // Initial state
      stage: 'setup',
      connectionStatus: 'disconnected',
      error: null,
      logs: [],
      isLogsExpanded: false,

      // Actions
      setStage: (stage) => set({ stage }, false, 'setStage'),
      
      setCurrentStage: (stage) => set({ stage }, false, 'setCurrentStage'),
      
      setConnectionStatus: (connectionStatus) => 
        set({ connectionStatus }, false, 'setConnectionStatus'),
      
      setError: (error) => set({ error }, false, 'setError'),
      
      addLog: (message, type) =>
        set(
          (state) => ({
            logs: [
              ...state.logs,
              {
                id: crypto.randomUUID(),
                message,
                type,
                timestamp: new Date(),
              },
            ].slice(-100), // Keep last 100 logs
          }),
          false,
          'addLog'
        ),
      
      clearLogs: () => set({ logs: [] }, false, 'clearLogs'),
      
      toggleLogs: () =>
        set((state) => ({ isLogsExpanded: !state.isLogsExpanded }), false, 'toggleLogs'),
    }),
    { name: 'app-store' }
  )
)
