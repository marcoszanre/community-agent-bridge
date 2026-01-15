// ============================================
// useMeetingAgent - Unified hook for all agent types in meetings
// Provides a consistent interface for Copilot Studio, Copilot Studio Anon, and Azure Foundry
// ============================================

import { useCallback, useRef, useState, useEffect } from 'react'
import { useAgentStore } from '@/stores/agentStore'
import { useAppStore } from '@/stores/appStore'
import { getCallAnalyticsService } from '@/services'
import {
  CopilotStudioAgentProvider,
  CopilotStudioAnonAgentProvider,
  AzureFoundryAgentProvider
} from '@/providers/agent'
import type {
  IAgentProvider,
  AgentConnectionState
} from '@/types/providers'

// Context for messages (used for enriching agent requests)
export interface MessageContext {
  captions?: { speaker: string; text: string }[]
  chatMessages?: { sender: string; text: string }[]
}

// Callback for when agent receives a message
export interface AgentMessageCallback {
  (message: { role: 'user' | 'assistant'; text: string; timestamp: Date }): void
}

// Options for the hook
export interface UseMeetingAgentOptions {
  onMessageReceived?: AgentMessageCallback
}

// Unified config that can represent any agent type
export interface MeetingAgentConfig {
  type: 'copilot-studio' | 'copilot-studio-anon' | 'azure-foundry'
  // Copilot Studio (authenticated)
  clientId?: string
  tenantId?: string
  environmentId?: string
  botId?: string
  botName?: string
  // Copilot Studio Anonymous (Direct Line)
  directLineSecret?: string
  // Azure Foundry
  projectEndpoint?: string
  agentName?: string
  clientSecret?: string
  region?: string
  displayName?: string
}

interface UseMeetingAgentReturn {
  // State
  isConnected: boolean
  isConnecting: boolean
  isProcessing: boolean
  connectionState: AgentConnectionState
  conversationId: string | null
  error: string | null
  
  // Actions
  connect: (config: MeetingAgentConfig) => Promise<{ success: boolean; conversationId: string | null }>
  sendMessage: (text: string, speaker?: string, context?: MessageContext) => Promise<{ text: string } | null>
  disconnect: () => Promise<void>
  
  // Provider access (for advanced use)
  provider: IAgentProvider | null
}

/**
 * Unified hook for using any agent type in meetings
 * Abstracts away the differences between Copilot Studio, Copilot Studio Anon, and Azure Foundry
 */
export function useMeetingAgent(options?: UseMeetingAgentOptions): UseMeetingAgentReturn {
  const analyticsService = getCallAnalyticsService()
  
  // Store the options callback in a ref so it's always up to date
  const onMessageReceivedRef = useRef(options?.onMessageReceived)
  useEffect(() => {
    onMessageReceivedRef.current = options?.onMessageReceived
  }, [options?.onMessageReceived])
  
  // Provider instance
  const providerRef = useRef<IAgentProvider | null>(null)
  const configRef = useRef<MeetingAgentConfig | null>(null)
  
  // State
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [connectionState, setConnectionState] = useState<AgentConnectionState>('disconnected')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Agent store for UI state
  const {
    addMessage,
    clearMessages,
    setConversationId: setStoreConversationId,
    setIsProcessing: setStoreIsProcessing,
    accessToken // For authenticated Copilot Studio
  } = useAgentStore()
  
  const { addLog } = useAppStore()

  /**
   * Create the appropriate provider based on config type
   */
  const createProvider = useCallback((config: MeetingAgentConfig): IAgentProvider => {
    switch (config.type) {
      case 'copilot-studio': {
        const provider = new CopilotStudioAgentProvider()
        return provider as unknown as IAgentProvider
      }
      case 'copilot-studio-anon': {
        const provider = new CopilotStudioAnonAgentProvider()
        return provider as unknown as IAgentProvider
      }
      case 'azure-foundry': {
        const provider = new AzureFoundryAgentProvider()
        return provider as unknown as IAgentProvider
      }
      default:
        throw new Error(`Unsupported agent type: ${config.type}`)
    }
  }, [])

  /**
   * Build provider-specific config - uses 'unknown' to avoid strict type checking
   * since provider configs have slightly different auth types
   */
  const buildProviderConfig = useCallback((config: MeetingAgentConfig): unknown => {
    const baseConfig = {
      id: `meeting-agent-${Date.now()}`,
      name: config.botName || config.displayName || config.agentName || 'Meeting Agent',
      createdAt: new Date(),
      category: 'agent' as const
    }

    switch (config.type) {
      case 'copilot-studio':
        return {
          ...baseConfig,
          type: 'copilot-studio',
          authType: 'microsoft-device-code',
          settings: {
            clientId: config.clientId || '',
            tenantId: config.tenantId || '',
            environmentId: config.environmentId || '',
            botId: config.botId || '',
            botName: config.botName
          }
        }

      case 'copilot-studio-anon':
        return {
          ...baseConfig,
          type: 'copilot-studio-anon',
          authType: 'none',
          settings: {
            directLineSecret: config.directLineSecret || '',
            botName: config.botName
          }
        }

      case 'azure-foundry':
        return {
          ...baseConfig,
          type: 'azure-foundry',
          authType: 'service-principal',
          settings: {
            projectEndpoint: config.projectEndpoint || '',
            agentName: config.agentName || '',
            tenantId: config.tenantId || '',
            clientId: config.clientId || '',
            clientSecret: config.clientSecret || '',
            region: config.region || '',
            displayName: config.displayName
          }
        }

      default:
        throw new Error(`Unsupported agent type: ${config.type}`)
    }
  }, [])

  /**
   * Connect to an agent
   */
  const connect = useCallback(async (config: MeetingAgentConfig): Promise<{ success: boolean; conversationId: string | null }> => {
    // Guard: prevent multiple simultaneous connection attempts
    if (isConnecting) {
      addLog('⏳ Connection already in progress, skipping duplicate request', 'info')
      return { success: false, conversationId: null }
    }
    
    // Guard: if already connected with a conversation, skip
    if (isConnected && conversationId) {
      addLog('✓ Already connected to agent', 'info')
      return { success: true, conversationId }
    }

    // Cleanup existing provider
    if (providerRef.current) {
      try {
        await providerRef.current.dispose()
      } catch (e) {
        console.warn('Error disposing previous provider:', e)
      }
      providerRef.current = null
    }

    setIsConnecting(true)
    setError(null)
    configRef.current = config

    try {
      addLog(`🤖 Connecting to ${config.type} agent...`, 'info')

      // Create provider
      const provider = createProvider(config)
      providerRef.current = provider

      // Set up callbacks
      provider.setCallbacks({
        onConnectionStateChanged: (state) => {
          setConnectionState(state)
          setIsConnected(state === 'connected')
          if (state === 'error') {
            setError('Connection lost')
          }
        },
        onMessageReceived: (message) => {
          const msgPayload = {
            role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
            text: message.content,
            timestamp: message.timestamp
          }
          // Use custom callback if provided, otherwise use default store addMessage
          if (onMessageReceivedRef.current) {
            onMessageReceivedRef.current(msgPayload)
          } else {
            addMessage(msgPayload)
          }
        },
        onConversationStarted: (conversation) => {
          setConversationId(conversation.id)
          setStoreConversationId(conversation.id)
          addLog(`📡 Conversation started: ${conversation.id.substring(0, 20)}...`, 'info')
        },
        onConversationEnded: () => {
          setConversationId(null)
          setStoreConversationId(null)
          setIsConnected(false)
        },
        onError: (err) => {
          setError(err.message)
          addLog(`❌ Agent error: ${err.message}`, 'error')
        },
        onTyping: () => {
          // Could show typing indicator
        }
      })

      // Initialize provider
      const providerConfig = buildProviderConfig(config)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await provider.initialize(providerConfig as any)

      // For authenticated Copilot Studio, we need to authenticate first
      if (config.type === 'copilot-studio') {
        if (!accessToken) {
          throw new Error('No access token available. Please sign in first.')
        }
        // The provider will use the token from the auth service
        await provider.authenticate()
      } else if (config.type === 'azure-foundry') {
        // Foundry uses service principal auth
        await provider.authenticate()
      }
      // Anonymous doesn't need auth

      // Start conversation
      const response = await provider.startConversation()

      // NOTE: Welcome messages are already added via the onMessageReceived callback
      // when the provider emits them. We only log here for visibility.
      if (response.messages && response.messages.length > 0) {
        for (const msg of response.messages) {
          if (msg.role === 'assistant' && msg.content) {
            addLog(`Welcome: "${msg.content.substring(0, 50)}..."`, 'success')
          }
        }
      }

      setIsConnected(true)
      setIsConnecting(false)
      setConnectionState('connected')
      addLog(`✅ Connected to ${config.type} agent`, 'success')

      return { success: true, conversationId: response.conversationId }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect'
      setError(errorMessage)
      setIsConnecting(false)
      setConnectionState('error')
      addLog(`❌ Connection failed: ${errorMessage}`, 'error')
      return { success: false, conversationId: null }
    }
  }, [createProvider, buildProviderConfig, addLog, addMessage, setStoreConversationId, accessToken, isConnecting, isConnected, conversationId])

  /**
   * Send a message to the agent
   */
  const sendMessage = useCallback(async (
    text: string,
    speaker?: string,
    _context?: MessageContext
  ): Promise<{ text: string } | null> => {
    const provider = providerRef.current
    
    if (!provider || !isConnected) {
      addLog('Agent not connected', 'error')
      return null
    }

    setIsProcessing(true)
    setStoreIsProcessing(true)

    try {
      // Note: Caller is responsible for adding user message to UI before calling sendMessage
      // This prevents duplicate messages when called from MeetingStage

      // Track for analytics
      if (speaker) {
        analyticsService.trackQuestion(speaker, text)
      }

      addLog(`📤 Sending: "${text.substring(0, 50)}..."`, 'info')

      // Send to agent
      const response = await provider.sendMessage(text)

      // Process response
      let responseText: string | null = null
      
      if (response.messages && response.messages.length > 0) {
        for (const msg of response.messages) {
          if (msg.role === 'assistant' && msg.content) {
            responseText = msg.content
            // Message already added via callback, but ensure it's tracked
            analyticsService.trackResponse(msg.content)
            addLog(`📥 Response: "${msg.content.substring(0, 50)}..."`, 'success')
          }
        }
      }

      setIsProcessing(false)
      setStoreIsProcessing(false)

      return responseText ? { text: responseText } : null

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
      addLog(`❌ Send failed: ${errorMessage}`, 'error')
      setIsProcessing(false)
      setStoreIsProcessing(false)
      return null
    }
  }, [isConnected, addLog, addMessage, setStoreIsProcessing])

  /**
   * Disconnect from the agent
   */
  const disconnect = useCallback(async () => {
    const provider = providerRef.current
    
    if (provider) {
      try {
        await provider.endConversation()
        await provider.dispose()
      } catch (e) {
        console.warn('Error disconnecting:', e)
      }
      providerRef.current = null
    }

    clearMessages()
    setConversationId(null)
    setStoreConversationId(null)
    setIsConnected(false)
    setConnectionState('disconnected')
    setError(null)
    configRef.current = null
    
    addLog('Disconnected from agent', 'info')
  }, [clearMessages, setStoreConversationId, addLog])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.dispose().catch(console.error)
      }
    }
  }, [])

  return {
    isConnected,
    isConnecting,
    isProcessing,
    connectionState,
    conversationId,
    error,
    connect,
    sendMessage,
    disconnect,
    provider: providerRef.current
  }
}
