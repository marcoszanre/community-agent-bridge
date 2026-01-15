import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { UserPreferences } from '@/types'

export type ThemeMode = 'light' | 'dark' | 'system'

interface PreferencesState {
  preferences: UserPreferences
  
  // Actions
  setDefaultAgentName: (name: string) => void
  setDefaultProviderId: (providerId: string | undefined) => void
  setDefaultVoice: (voice: string) => void
  setTheme: (theme: ThemeMode) => void
  setUIPreference: <K extends keyof NonNullable<UserPreferences['ui']>>(
    key: K, 
    value: NonNullable<UserPreferences['ui']>[K]
  ) => void
  updatePreferences: (updates: Partial<UserPreferences>) => void
  resetPreferences: () => void
}

const defaultPreferences: UserPreferences = {
  defaultAgentName: import.meta.env.VITE_AGENT_NAME || 'AI Assistant',
  defaultProviderId: undefined,
  defaultVoice: 'en-US-JennyNeural',
  ui: {
    theme: 'light',
    logsExpanded: false,
    showAgentPanel: true
  }
}

// Apply theme to document
export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  const isDark = theme === 'dark' || 
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  
  if (isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export const usePreferencesStore = create<PreferencesState>()(
  devtools(
    persist(
      (set) => ({
        preferences: defaultPreferences,

        setDefaultAgentName: (defaultAgentName) => set(
          (state) => ({
            preferences: { ...state.preferences, defaultAgentName }
          }),
          false,
          'setDefaultAgentName'
        ),

        setDefaultProviderId: (defaultProviderId) => set(
          (state) => ({
            preferences: { ...state.preferences, defaultProviderId }
          }),
          false,
          'setDefaultProviderId'
        ),

        setDefaultVoice: (defaultVoice) => set(
          (state) => ({
            preferences: { ...state.preferences, defaultVoice }
          }),
          false,
          'setDefaultVoice'
        ),

        setTheme: (theme) => {
          applyTheme(theme)
          set(
            (state) => ({
              preferences: {
                ...state.preferences,
                ui: { ...state.preferences.ui, theme }
              }
            }),
            false,
            'setTheme'
          )
        },

        setUIPreference: (key, value) => set(
          (state) => ({
            preferences: {
              ...state.preferences,
              ui: {
                ...state.preferences.ui,
                [key]: value
              }
            }
          }),
          false,
          'setUIPreference'
        ),

        updatePreferences: (updates) => set(
          (state) => ({
            preferences: { ...state.preferences, ...updates }
          }),
          false,
          'updatePreferences'
        ),

        resetPreferences: () => set(
          { preferences: defaultPreferences },
          false,
          'resetPreferences'
        )
      }),
      {
        name: 'preferences-store',
        partialize: (state) => ({
          preferences: state.preferences
        })
      }
    ),
    { name: 'preferences-store' }
  )
)
