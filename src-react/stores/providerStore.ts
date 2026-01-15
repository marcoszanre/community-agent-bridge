// ============================================
// Provider Store
// Zustand store for managing provider instances
// ============================================

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { 
  ProviderRegistry, 
  ensureProvidersRegistered 
} from '@/providers'
import type {
  IProvider,
  IMeetingProvider,
  ISpeechProvider,
  IAgentProvider,
  IProcessorProvider,
  ProviderCategory,
  ProviderStatus,
  ProviderRuntimeState,
  BaseProviderConfig
} from '@/types/providers'

// Ensure providers are registered
ensureProvidersRegistered()

/**
 * Provider instance info
 */
interface ProviderInstanceInfo {
  instanceId: string
  type: string
  category: ProviderCategory
  status: ProviderStatus
  error?: string
  createdAt: Date
}

/**
 * Active providers by category
 */
interface ActiveProviders {
  meeting: string | null
  speech: string | null
  agent: string | null
  preprocessor: string | null
  postprocessor: string | null
}

/**
 * Provider store state
 */
interface ProviderStoreState {
  // All provider instances
  instances: Record<string, ProviderInstanceInfo>
  
  // Active provider per category
  activeProviders: ActiveProviders
  
  // Loading states
  isInitializing: boolean
  
  // Actions - Instance Management
  createInstance: <T extends IProvider>(
    instanceId: string,
    type: string,
    config: BaseProviderConfig
  ) => Promise<T>
  
  disposeInstance: (instanceId: string) => Promise<void>
  disposeAllInstances: () => Promise<void>
  
  // Actions - Active Provider Management
  setActiveProvider: (category: keyof ActiveProviders, instanceId: string | null) => void
  
  // Getters
  getInstance: <T extends IProvider>(instanceId: string) => T | undefined
  getActiveInstance: <T extends IProvider>(category: keyof ActiveProviders) => T | undefined
  getInstancesByCategory: (category: ProviderCategory) => ProviderInstanceInfo[]
  
  // Typed getters for convenience
  getMeetingProvider: (instanceId?: string) => IMeetingProvider | undefined
  getSpeechProvider: (instanceId?: string) => ISpeechProvider | undefined
  getAgentProvider: (instanceId?: string) => IAgentProvider | undefined
  getProcessorProvider: (instanceId?: string) => IProcessorProvider | undefined
  
  // State updates
  updateInstanceStatus: (instanceId: string, status: ProviderStatus, error?: string) => void
}

export const useProviderStore = create<ProviderStoreState>()(
  devtools(
    (set, get) => ({
      instances: {},
      activeProviders: {
        meeting: null,
        speech: null,
        agent: null,
        preprocessor: null,
        postprocessor: null
      },
      isInitializing: false,

      // Create and initialize a provider instance
      createInstance: async <T extends IProvider>(
        instanceId: string,
        type: string,
        config: BaseProviderConfig
      ): Promise<T> => {
        // Check if instance already exists
        if (get().instances[instanceId]) {
          await get().disposeInstance(instanceId)
        }

        try {
          // Create instance through registry
          const instance = await ProviderRegistry.createNamedInstance<T>(
            instanceId,
            type,
            config
          )

          // Get category from registration
          const registration = ProviderRegistry.getRegistration(type)
          const category = registration?.category || 'processor'

          // Add to store
          set(
            (state) => ({
              instances: {
                ...state.instances,
                [instanceId]: {
                  instanceId,
                  type,
                  category,
                  status: instance.status,
                  createdAt: new Date()
                }
              }
            }),
            false,
            'createInstance'
          )

          // Subscribe to state changes
          instance.onStateChange((providerState: ProviderRuntimeState) => {
            get().updateInstanceStatus(instanceId, providerState.status, providerState.error)
          })

          return instance
        } catch (error) {
          console.error(`Failed to create provider instance ${instanceId}:`, error)
          throw error
        }
      },

      // Dispose a provider instance
      disposeInstance: async (instanceId: string) => {
        try {
          await ProviderRegistry.disposeInstance(instanceId)
          
          set(
            (state) => {
              const { [instanceId]: _, ...remaining } = state.instances
              
              // Clear from active if it was active
              const newActive = { ...state.activeProviders }
              for (const key of Object.keys(newActive) as (keyof ActiveProviders)[]) {
                if (newActive[key] === instanceId) {
                  newActive[key] = null
                }
              }
              
              return {
                instances: remaining,
                activeProviders: newActive
              }
            },
            false,
            'disposeInstance'
          )
        } catch (error) {
          console.error(`Failed to dispose provider instance ${instanceId}:`, error)
        }
      },

      // Dispose all instances
      disposeAllInstances: async () => {
        await ProviderRegistry.disposeAll()
        
        set(
          {
            instances: {},
            activeProviders: {
              meeting: null,
              speech: null,
              agent: null,
              preprocessor: null,
              postprocessor: null
            }
          },
          false,
          'disposeAllInstances'
        )
      },

      // Set active provider for a category
      setActiveProvider: (category: keyof ActiveProviders, instanceId: string | null) => {
        set(
          (state) => ({
            activeProviders: {
              ...state.activeProviders,
              [category]: instanceId
            }
          }),
          false,
          'setActiveProvider'
        )
      },

      // Get instance by ID
      getInstance: <T extends IProvider>(instanceId: string): T | undefined => {
        return ProviderRegistry.getInstance<T>(instanceId)
      },

      // Get active instance for a category
      getActiveInstance: <T extends IProvider>(category: keyof ActiveProviders): T | undefined => {
        const instanceId = get().activeProviders[category]
        if (!instanceId) return undefined
        return ProviderRegistry.getInstance<T>(instanceId)
      },

      // Get all instances for a category
      getInstancesByCategory: (category: ProviderCategory): ProviderInstanceInfo[] => {
        return Object.values(get().instances).filter(i => i.category === category)
      },

      // Typed getter for meeting provider
      getMeetingProvider: (instanceId?: string): IMeetingProvider | undefined => {
        const id = instanceId || get().activeProviders.meeting
        if (!id) return undefined
        return ProviderRegistry.getInstance<IMeetingProvider>(id)
      },

      // Typed getter for speech provider
      getSpeechProvider: (instanceId?: string): ISpeechProvider | undefined => {
        const id = instanceId || get().activeProviders.speech
        if (!id) return undefined
        return ProviderRegistry.getInstance<ISpeechProvider>(id)
      },

      // Typed getter for agent provider
      getAgentProvider: (instanceId?: string): IAgentProvider | undefined => {
        const id = instanceId || get().activeProviders.agent
        if (!id) return undefined
        return ProviderRegistry.getInstance<IAgentProvider>(id)
      },

      // Typed getter for processor provider
      getProcessorProvider: (instanceId?: string): IProcessorProvider | undefined => {
        const id = instanceId || get().activeProviders.preprocessor
        if (!id) return undefined
        return ProviderRegistry.getInstance<IProcessorProvider>(id)
      },

      // Update instance status
      updateInstanceStatus: (instanceId: string, status: ProviderStatus, error?: string) => {
        set(
          (state) => {
            const instance = state.instances[instanceId]
            if (!instance) return state

            return {
              instances: {
                ...state.instances,
                [instanceId]: {
                  ...instance,
                  status,
                  error
                }
              }
            }
          },
          false,
          'updateInstanceStatus'
        )
      }
    }),
    { name: 'provider-store' }
  )
)

// Selectors
export const selectActiveProviders = (state: ProviderStoreState) => state.activeProviders
export const selectInstances = (state: ProviderStoreState) => state.instances
export const selectMeetingInstances = (state: ProviderStoreState) => 
  Object.values(state.instances).filter(i => i.category === 'meeting')
export const selectAgentInstances = (state: ProviderStoreState) => 
  Object.values(state.instances).filter(i => i.category === 'agent')
