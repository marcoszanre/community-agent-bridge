import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { 
  AgentProviderConfig, 
  CopilotStudioProviderConfig,
  AgentProviderInstance,
  AgentProviderStatus
} from '@/types'
import {
  saveAgentCredentialsSecure,
  deleteAgentCredentialsSecure,
  loadAllAgentCredentials,
  stripSecureFields
} from './agentCredentialHelpers'

export interface AgentValidationStatus {
  isValid: boolean | null  // null = not tested yet
  message?: string
  details?: string
  sample?: string
  lastTestedAt?: Date
}

interface AgentProvidersState {
  // Saved provider configurations
  providers: AgentProviderConfig[]
  
  // Flag indicating if credentials have been loaded from secure storage
  credentialsLoaded: boolean
  
  // Validation statuses for each provider
  validationStatuses: Record<string, AgentValidationStatus>
  
  // Runtime instances (per meeting, keyed by tabId)
  instances: Record<string, Record<string, AgentProviderInstance>>
  
  // Actions - Provider Configuration
  addProvider: (config: AgentProviderConfig) => void
  updateProvider: (id: string, updates: Partial<AgentProviderConfig>) => void
  removeProvider: (id: string) => void
  setDefaultProvider: (id: string) => void
  getDefaultProvider: () => AgentProviderConfig | undefined
  
  // Actions - Credential Loading
  loadCredentials: () => Promise<void>
  
  // Actions - Provider Instances (per meeting)
  initializeInstance: (tabId: string, providerId: string) => void
  setInstanceStatus: (tabId: string, providerId: string, status: AgentProviderStatus, error?: string) => void
  setInstanceAuth: (tabId: string, providerId: string, auth: Partial<AgentProviderInstance['auth']>) => void
  setInstanceConversation: (tabId: string, providerId: string, conversation: AgentProviderInstance['conversation']) => void
  clearInstances: (tabId: string) => void
  
  // Actions - Validation
  setProviderValidationStatus: (id: string, status: AgentValidationStatus) => void
  clearProviderValidationStatus: (id: string) => void
  getProviderValidationStatus: (id: string) => AgentValidationStatus | undefined
  
  // Getters
  getProvider: (id: string) => AgentProviderConfig | undefined
  getInstance: (tabId: string, providerId: string) => AgentProviderInstance | undefined
  getInstancesForMeeting: (tabId: string) => Record<string, AgentProviderInstance>
}

// Create default Copilot Studio provider from env config
// Only use env vars in development mode to avoid bundling secrets into production builds
const createDefaultCopilotProvider = (): CopilotStudioProviderConfig | null => {
  // In production, don't auto-create providers from env vars
  if (!import.meta.env.DEV) {
    return null
  }
  
  const clientId = import.meta.env.VITE_COPILOT_APP_CLIENT_ID
  const tenantId = import.meta.env.VITE_COPILOT_TENANT_ID
  const environmentId = import.meta.env.VITE_COPILOT_ENVIRONMENT_ID
  const botId = import.meta.env.VITE_COPILOT_AGENT_IDENTIFIER
  
  if (!clientId || !tenantId || !environmentId || !botId) {
    return null
  }
  
  return {
    id: 'default-copilot-studio',
    name: 'Copilot Studio (Default)',
    type: 'copilot-studio',
    authType: 'microsoft-device-code',
    isDefault: true,
    createdAt: new Date(),
    preprocessing: {
      enabled: true,
      ttsOptimization: true
    },
    postprocessing: {
      enabled: true,
      formatLinks: true
    },
    settings: {
      clientId,
      tenantId,
      environmentId,
      botId,
      botName: import.meta.env.VITE_AGENT_NAME || 'AI Agent'
    }
  }
}

const defaultProvider = createDefaultCopilotProvider()
const initialProviders: AgentProviderConfig[] = defaultProvider ? [defaultProvider] : []

export const useAgentProvidersStore = create<AgentProvidersState>()(
  devtools(
    persist(
      (set, get) => ({
        providers: initialProviders,
        credentialsLoaded: false,
        validationStatuses: {},
        instances: {},

        // Add a new provider configuration
        addProvider: (config) => {
          // Store credentials securely (async, fire-and-forget for state update)
          saveAgentCredentialsSecure(config).catch(console.error)
          
          set(
            (state) => ({
              providers: [...state.providers, config]
            }),
            false,
            'addProvider'
          )
        },

        // Update an existing provider
        updateProvider: (id, updates) => {
          // If settings are being updated, save credentials securely
          const currentProvider = get().getProvider(id)
          if (currentProvider && updates.settings) {
            const updatedConfig = { ...currentProvider, ...updates } as AgentProviderConfig
            saveAgentCredentialsSecure(updatedConfig).catch(console.error)
          }
          
          set(
            (state) => ({
              providers: state.providers.map(p => 
                p.id === id ? { ...p, ...updates } as AgentProviderConfig : p
              )
            }),
            false,
            'updateProvider'
          )
        },

        // Remove a provider
        removeProvider: (id) => {
          // Delete credentials from secure storage
          deleteAgentCredentialsSecure(id).catch(console.error)
          
          set(
            (state) => ({
              providers: state.providers.filter(p => p.id !== id)
            }),
            false,
            'removeProvider'
          )
        },
        
        // Load credentials from secure storage for all providers
        loadCredentials: async () => {
          const { providers, credentialsLoaded } = get()
          
          // Skip if already loaded
          if (credentialsLoaded) {
            return
          }
          
          try {
            const providersWithCredentials = await loadAllAgentCredentials(providers)
            set(
              { 
                providers: providersWithCredentials,
                credentialsLoaded: true 
              },
              false,
              'loadCredentials'
            )
          } catch (error) {
            console.error('Failed to load agent credentials:', error)
            set({ credentialsLoaded: true }, false, 'loadCredentials')
          }
        },

        // Set default provider
        setDefaultProvider: (id) => set(
          (state) => ({
            providers: state.providers.map(p => ({
              ...p,
              isDefault: p.id === id
            })) as AgentProviderConfig[]
          }),
          false,
          'setDefaultProvider'
        ),

        // Get default provider
        getDefaultProvider: () => {
          const state = get()
          return state.providers.find(p => p.isDefault) || state.providers[0]
        },

        // Initialize a provider instance for a meeting
        initializeInstance: (tabId, providerId) => {
          const provider = get().getProvider(providerId)
          if (!provider) return

          set(
            (state) => ({
              instances: {
                ...state.instances,
                [tabId]: {
                  ...state.instances[tabId],
                  [providerId]: {
                    config: provider,
                    status: 'idle',
                    auth: provider.authType === 'microsoft-device-code' ? {
                      isAuthenticated: false
                    } : undefined
                  }
                }
              }
            }),
            false,
            'initializeInstance'
          )
        },

        // Set instance status
        setInstanceStatus: (tabId, providerId, status, error) => set(
          (state) => {
            const instance = state.instances[tabId]?.[providerId]
            if (!instance) return state

            return {
              instances: {
                ...state.instances,
                [tabId]: {
                  ...state.instances[tabId],
                  [providerId]: {
                    ...instance,
                    status,
                    error
                  }
                }
              }
            }
          },
          false,
          'setInstanceStatus'
        ),

        // Set instance auth state
        setInstanceAuth: (tabId, providerId, auth) => set(
          (state) => {
            const instance = state.instances[tabId]?.[providerId]
            if (!instance) return state

            return {
              instances: {
                ...state.instances,
                [tabId]: {
                  ...state.instances[tabId],
                  [providerId]: {
                    ...instance,
                    auth: { 
                      isAuthenticated: instance.auth?.isAuthenticated ?? false,
                      ...instance.auth, 
                      ...auth 
                    }
                  }
                }
              }
            }
          },
          false,
          'setInstanceAuth'
        ),

        // Set instance conversation
        setInstanceConversation: (tabId, providerId, conversation) => set(
          (state) => {
            const instance = state.instances[tabId]?.[providerId]
            if (!instance) return state

            return {
              instances: {
                ...state.instances,
                [tabId]: {
                  ...state.instances[tabId],
                  [providerId]: {
                    ...instance,
                    conversation
                  }
                }
              }
            }
          },
          false,
          'setInstanceConversation'
        ),

        // Clear all instances for a meeting
        clearInstances: (tabId) => set(
          (state) => {
            const { [tabId]: removed, ...rest } = state.instances
            return { instances: rest }
          },
          false,
          'clearInstances'
        ),

        // Set validation status for a provider
        setProviderValidationStatus: (id, status) => set(
          (state) => ({
            validationStatuses: {
              ...state.validationStatuses,
              [id]: status
            }
          }),
          false,
          'setProviderValidationStatus'
        ),

        // Clear validation status for a provider
        clearProviderValidationStatus: (id) => set(
          (state) => {
            const { [id]: removed, ...rest } = state.validationStatuses
            return { validationStatuses: rest }
          },
          false,
          'clearProviderValidationStatus'
        ),

        // Get validation status for a provider
        getProviderValidationStatus: (id) => get().validationStatuses[id],

        // Get a provider by ID
        getProvider: (id) => get().providers.find(p => p.id === id),

        // Get an instance
        getInstance: (tabId, providerId) => get().instances[tabId]?.[providerId],

        // Get all instances for a meeting
        getInstancesForMeeting: (tabId) => get().instances[tabId] || {}
      }),
      {
        name: 'agent-providers-store',
        partialize: (state) => ({
          // Strip secure fields from providers before saving to localStorage
          providers: state.providers.map(p => stripSecureFields(p))
        }),
        // After hydration, load credentials from secure storage
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Load credentials asynchronously after rehydration
            state.loadCredentials()
          }
        }
      }
    ),
    { name: 'agent-providers-store' }
  )
)
