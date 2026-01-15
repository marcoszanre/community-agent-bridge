// ============================================
// Agent Provider Hook
// React hook for using agent providers
// ============================================

import { useCallback, useEffect, useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import type {
  IAgentProvider,
  AgentProviderConfig,
  AgentConnectionState,
  AgentMessage,
  AgentResponse,
  ProviderAuthState
} from '@/types/providers'

interface UseAgentProviderOptions {
  instanceId?: string
  autoCreate?: boolean
  providerType?: string
  config?: AgentProviderConfig
}

interface UseAgentProviderReturn {
  // Provider state
  provider: IAgentProvider | undefined
  isReady: boolean
  isConnecting: boolean
  isConnected: boolean
  connectionState: AgentConnectionState
  error: string | undefined
  
  // Auth state
  authState: ProviderAuthState | null
  isAuthenticated: boolean
  isAuthenticating: boolean
  deviceCode: ProviderAuthState['deviceCode'] | undefined
  
  // Conversation data
  messages: AgentMessage[]
  conversationId: string | null
  
  // Actions
  createProvider: (type: string, config: AgentProviderConfig) => Promise<IAgentProvider>
  authenticate: () => Promise<ProviderAuthState>
  startConversation: () => Promise<AgentResponse>
  sendMessage: (text: string) => Promise<AgentResponse>
  endConversation: () => Promise<void>
  clearHistory: () => void
  dispose: () => Promise<void>
}

/**
 * Hook for using agent providers
 */
export function useAgentProvider(
  options: UseAgentProviderOptions = {}
): UseAgentProviderReturn {
  const {
    instanceId = 'default-agent',
    autoCreate = false,
    providerType = 'copilot-studio',
    config
  } = options

  const {
    createInstance,
    disposeInstance,
    getAgentProvider,
    setActiveProvider,
    instances
  } = useProviderStore()

  const [localState, setLocalState] = useState<{
    connectionState: AgentConnectionState
    authState: ProviderAuthState | null
    messages: AgentMessage[]
    conversationId: string | null
    error?: string
  }>({
    connectionState: 'disconnected',
    authState: null,
    messages: [],
    conversationId: null
  })

  // Get current provider
  const provider = getAgentProvider(instanceId)
  const instanceInfo = instances[instanceId]

  // Auto-create provider if configured
  useEffect(() => {
    if (autoCreate && config && !provider) {
      createProvider(providerType, config).catch(console.error)
    }
  }, [autoCreate, config, provider])

  // Set up callbacks when provider is available
  useEffect(() => {
    if (!provider) return

    provider.setCallbacks({
      onConnectionStateChanged: (state) => {
        setLocalState(prev => ({ ...prev, connectionState: state }))
      },
      onAuthStateChanged: (authState) => {
        setLocalState(prev => ({ ...prev, authState }))
      },
      onMessageReceived: (message) => {
        setLocalState(prev => ({
          ...prev,
          messages: [...prev.messages, message]
        }))
      },
      onConversationStarted: (conversation) => {
        setLocalState(prev => ({
          ...prev,
          conversationId: conversation.id,
          messages: conversation.messages
        }))
      },
      onConversationEnded: () => {
        setLocalState(prev => ({
          ...prev,
          connectionState: 'disconnected',
          conversationId: null
        }))
      },
      onError: (error) => {
        setLocalState(prev => ({ ...prev, error: error.message }))
      }
    })

    // Sync initial state
    if (provider.authState) {
      setLocalState(prev => ({ ...prev, authState: provider.authState }))
    }
    if (provider.conversation) {
      setLocalState(prev => ({
        ...prev,
        connectionState: provider.connectionState,
        conversationId: provider.conversation?.id || null,
        messages: provider.conversation?.messages || []
      }))
    }
  }, [provider])

  // Create a new provider instance
  const createProvider = useCallback(async (
    type: string,
    providerConfig: AgentProviderConfig
  ): Promise<IAgentProvider> => {
    const newProvider = await createInstance<IAgentProvider>(
      instanceId,
      type,
      providerConfig
    )
    
    setActiveProvider('agent', instanceId)
    return newProvider
  }, [instanceId, createInstance, setActiveProvider])

  // Authenticate
  const authenticate = useCallback(async (): Promise<ProviderAuthState> => {
    if (!provider) {
      throw new Error('No agent provider available. Create one first.')
    }
    
    return provider.authenticate()
  }, [provider])

  // Start conversation
  const startConversation = useCallback(async (): Promise<AgentResponse> => {
    if (!provider) {
      throw new Error('No agent provider available. Create one first.')
    }
    
    return provider.startConversation()
  }, [provider])

  // Send message
  const sendMessage = useCallback(async (text: string): Promise<AgentResponse> => {
    if (!provider) {
      throw new Error('No agent provider available. Create one first.')
    }
    
    // Add user message to local state immediately
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date()
    }
    setLocalState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage]
    }))
    
    return provider.sendMessage(text)
  }, [provider])

  // End conversation
  const endConversation = useCallback(async (): Promise<void> => {
    if (!provider) return
    await provider.endConversation()
    setLocalState(prev => ({
      ...prev,
      connectionState: 'disconnected',
      conversationId: null,
      messages: []
    }))
  }, [provider])

  // Clear history
  const clearHistory = useCallback((): void => {
    if (provider) {
      provider.clearHistory()
    }
    setLocalState(prev => ({ ...prev, messages: [] }))
  }, [provider])

  // Dispose provider
  const dispose = useCallback(async (): Promise<void> => {
    await disposeInstance(instanceId)
    setLocalState({
      connectionState: 'disconnected',
      authState: null,
      messages: [],
      conversationId: null
    })
  }, [instanceId, disposeInstance])

  return {
    provider,
    isReady: instanceInfo?.status === 'ready' || instanceInfo?.status === 'connected',
    isConnecting: localState.connectionState === 'connecting',
    isConnected: localState.connectionState === 'connected',
    connectionState: localState.connectionState,
    error: localState.error || instanceInfo?.error,
    authState: localState.authState,
    isAuthenticated: localState.authState?.isAuthenticated ?? false,
    isAuthenticating: localState.authState?.isAuthenticating ?? false,
    deviceCode: localState.authState?.deviceCode,
    messages: localState.messages,
    conversationId: localState.conversationId,
    createProvider,
    authenticate,
    startConversation,
    sendMessage,
    endConversation,
    clearHistory,
    dispose
  }
}
