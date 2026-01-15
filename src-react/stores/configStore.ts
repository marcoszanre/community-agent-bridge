import { create } from 'zustand'
import { devtools, persist, createJSONStorage } from 'zustand/middleware'
import type { AppConfig } from '@/types'
import { createSecureStorage, SecureStorageConfigs } from './secureStorage'

export interface ServiceValidationStatus {
  isValid: boolean | null  // null = not tested yet
  message?: string
  lastTestedAt?: Date
}

export interface ValidationStatuses {
  acs: ServiceValidationStatus
  speech: ServiceValidationStatus
  openai: ServiceValidationStatus
}

// Load from Vite environment variables (from .env file)
// Only use env vars in development mode to avoid bundling secrets into production builds
const envConfig: AppConfig = import.meta.env.DEV ? {
  endpoint: import.meta.env.VITE_ACS_ENDPOINT || '',
  accessKey: import.meta.env.VITE_ACS_ACCESS_KEY || '',
  agentName: import.meta.env.VITE_AGENT_NAME || '',
  callUrl: import.meta.env.VITE_CALL_URL || '',
  copilotStudio: {
    appClientId: import.meta.env.VITE_COPILOT_APP_CLIENT_ID || '',
    clientId: import.meta.env.VITE_COPILOT_APP_CLIENT_ID || '',
    tenantId: import.meta.env.VITE_COPILOT_TENANT_ID || '',
    environmentId: import.meta.env.VITE_COPILOT_ENVIRONMENT_ID || '',
    agentIdentifier: import.meta.env.VITE_COPILOT_AGENT_IDENTIFIER || '',
    botId: import.meta.env.VITE_COPILOT_AGENT_IDENTIFIER || '',
    botName: import.meta.env.VITE_AGENT_NAME || '',
  },
  speech: {
    key: import.meta.env.VITE_SPEECH_KEY || '',
    region: import.meta.env.VITE_SPEECH_REGION || '',
    endpoint: import.meta.env.VITE_SPEECH_ENDPOINT || '',
    voiceName: 'en-US-JennyNeural',
  },
  openai: {
    endpoint: import.meta.env.VITE_OPENAI_ENDPOINT || '',
    deployment: import.meta.env.VITE_OPENAI_DEPLOYMENT || '',
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  },
} : {
  // Production builds start with empty config - users must configure via UI
  endpoint: '',
  accessKey: '',
  agentName: '',
  callUrl: '',
  copilotStudio: {
    appClientId: '',
    clientId: '',
    tenantId: '',
    environmentId: '',
    agentIdentifier: '',
    botId: '',
    botName: '',
  },
  speech: {
    key: '',
    region: 'eastus',
    endpoint: '',
    voiceName: 'en-US-JennyNeural',
  },
  openai: {
    endpoint: '',
    deployment: '',
    apiKey: '',
  },
}

// Debug: log env vars on load (dev only)
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log('🔧 ENV Config loaded:', {
    agentName: envConfig.agentName,
    hasAccessKey: !!envConfig.accessKey,
    hasSpeechKey: !!envConfig.speech.key,
    hasCopilotClientId: !!envConfig.copilotStudio.clientId,
  })
}

const defaultConfig: AppConfig = envConfig

const defaultValidationStatuses: ValidationStatuses = {
  acs: { isValid: null },
  speech: { isValid: null },
  openai: { isValid: null }
}

interface ConfigState {
  config: AppConfig
  validationStatuses: ValidationStatuses
  setConfig: (config: Partial<AppConfig>) => void
  setCopilotStudioConfig: (config: Partial<AppConfig['copilotStudio']>) => void
  setSpeechConfig: (config: Partial<AppConfig['speech']>) => void
  setOpenAIConfig: (config: Partial<AppConfig['openai']>) => void
  resetConfig: () => void
  isConfigValid: () => boolean
  isCopilotConfigValid: () => boolean
  setValidationStatus: (service: keyof ValidationStatuses, status: ServiceValidationStatus) => void
  clearValidationStatus: (service: keyof ValidationStatuses) => void
  clearAllValidationStatuses: () => void
}

export const useConfigStore = create<ConfigState>()(
  devtools(
    persist(
      (set, get) => ({
        config: defaultConfig,
        validationStatuses: defaultValidationStatuses,

        setConfig: (updates) =>
          set(
            (state) => ({
              config: { ...state.config, ...updates },
            }),
            false,
            'setConfig'
          ),

        setCopilotStudioConfig: (updates) =>
          set(
            (state) => ({
              config: {
                ...state.config,
                copilotStudio: { ...state.config.copilotStudio, ...updates },
              },
            }),
            false,
            'setCopilotStudioConfig'
          ),

        setSpeechConfig: (updates) =>
          set(
            (state) => ({
              config: {
                ...state.config,
                speech: { ...state.config.speech, ...updates },
              },
            }),
            false,
            'setSpeechConfig'
          ),

        setOpenAIConfig: (updates) =>
          set(
            (state) => ({
              config: {
                ...state.config,
                openai: { ...state.config.openai, ...updates },
              },
            }),
            false,
            'setOpenAIConfig'
          ),

        resetConfig: () => set({ config: defaultConfig }, false, 'resetConfig'),

        isConfigValid: () => {
          const { config } = get()
          return Boolean(
            config.endpoint?.trim() && 
            config.accessKey?.trim()
          )
        },

        isCopilotConfigValid: () => {
          const { config } = get()
          const cs = config.copilotStudio
          return Boolean(
            (cs.clientId?.trim() || cs.appClientId?.trim()) &&
            cs.tenantId?.trim() &&
            cs.environmentId?.trim() &&
            (cs.botId?.trim() || cs.agentIdentifier?.trim())
          )
        },

        setValidationStatus: (service, status) =>
          set(
            (state) => ({
              validationStatuses: {
                ...state.validationStatuses,
                [service]: status
              }
            }),
            false,
            'setValidationStatus'
          ),

        clearValidationStatus: (service) =>
          set(
            (state) => ({
              validationStatuses: {
                ...state.validationStatuses,
                [service]: { isValid: null }
              }
            }),
            false,
            'clearValidationStatus'
          ),

        clearAllValidationStatuses: () =>
          set(
            { validationStatuses: defaultValidationStatuses },
            false,
            'clearAllValidationStatuses'
          ),
      }),
      {
        name: 'teams-agent-bridge-config',
        // Use secure storage adapter for credential fields
        storage: createJSONStorage(() => createSecureStorage(SecureStorageConfigs.config)),
        // Merge stored config with env config - prefer env vars for empty stored values
        merge: (persistedState, currentState) => {
          const persisted = persistedState as { config: AppConfig } | undefined
          if (!persisted?.config) return currentState
          
          // Deep merge: use env value if stored value is empty
          const mergeValues = (stored: string | undefined, env: string | undefined) => 
            stored?.trim() ? stored : (env || '')
          
          return {
            ...currentState,
            config: {
              endpoint: mergeValues(persisted.config.endpoint, envConfig.endpoint),
              accessKey: mergeValues(persisted.config.accessKey, envConfig.accessKey),
              agentName: mergeValues(persisted.config.agentName, envConfig.agentName),
              callUrl: mergeValues(persisted.config.callUrl, envConfig.callUrl),
              copilotStudio: {
                appClientId: mergeValues(persisted.config.copilotStudio?.appClientId, envConfig.copilotStudio.appClientId),
                clientId: mergeValues(persisted.config.copilotStudio?.clientId, envConfig.copilotStudio.clientId),
                tenantId: mergeValues(persisted.config.copilotStudio?.tenantId, envConfig.copilotStudio.tenantId),
                environmentId: mergeValues(persisted.config.copilotStudio?.environmentId, envConfig.copilotStudio.environmentId),
                agentIdentifier: mergeValues(persisted.config.copilotStudio?.agentIdentifier, envConfig.copilotStudio.agentIdentifier),
                botId: mergeValues(persisted.config.copilotStudio?.botId, envConfig.copilotStudio.botId),
                botName: mergeValues(persisted.config.copilotStudio?.botName, envConfig.copilotStudio.botName),
              },
              speech: {
                key: mergeValues(persisted.config.speech?.key, envConfig.speech.key),
                region: mergeValues(persisted.config.speech?.region, envConfig.speech.region),
                endpoint: mergeValues(persisted.config.speech?.endpoint, envConfig.speech.endpoint),
                voiceName: mergeValues(persisted.config.speech?.voiceName, envConfig.speech.voiceName),
              },
              openai: {
                endpoint: mergeValues(persisted.config.openai?.endpoint, envConfig.openai.endpoint),
                deployment: mergeValues(persisted.config.openai?.deployment, envConfig.openai.deployment),
                apiKey: mergeValues(persisted.config.openai?.apiKey, envConfig.openai.apiKey),
              },
            },
          }
        },
      }
    ),
    { name: 'config-store' }
  )
)
