// useCopilotAgent - React hook for Copilot Studio agent conversations
// Supports both authenticated (Microsoft auth) and anonymous (Direct Line) providers

import { useCallback, useRef } from 'react'
import { http } from '@tauri-apps/api'
import { useAgentStore } from '@/stores/agentStore'
import { useAppStore } from '@/stores/appStore'
import { useConfigStore } from '@/stores/configStore'
import { getCopilotService, getCallAnalyticsService } from '@/services'
import type { CopilotStudioConfig } from '@/types'

// Context for messages
export interface MessageContext {
  captions?: { speaker: string; text: string }[]
  chatMessages?: { sender: string; text: string }[]
}

// Extended config to support anonymous Direct Line
export interface ExtendedCopilotConfig extends Partial<CopilotStudioConfig> {
  providerType?: 'copilot-studio' | 'copilot-studio-anon'
  directLineSecret?: string
}

// Direct Line types for anonymous provider
interface DirectLineActivity {
  type: string
  id?: string
  timestamp?: string
  from?: { id: string; name?: string; role?: string }
  conversation?: { id: string }
  text?: string
  suggestedActions?: { actions: Array<{ type: string; title: string; value: string }> }
}

interface DirectLineConversation {
  conversationId: string
  token: string
  expires_in: number
}

interface DirectLineActivitiesResponse {
  activities: DirectLineActivity[]
  watermark?: string
}

const DIRECT_LINE_BASE_URL = 'https://directline.botframework.com/v3/directline'

export function useCopilotAgent() {
  const copilotService = getCopilotService()
  const analyticsService = getCallAnalyticsService()
  const isInitialized = useRef(false)
  
  // Direct Line state for anonymous providers
  const directLineToken = useRef<string | null>(null)
  const directLineConversationId = useRef<string | null>(null)
  const directLineWatermark = useRef<string | null>(null)
  const isAnonymousProvider = useRef(false)
  
  const {
    accessToken,
    setConversationId,
    conversationId,
    addMessage,
    clearMessages,
    setIsProcessing,
    isProcessing
  } = useAgentStore()
  
  const { addLog } = useAppStore()
  const { config } = useConfigStore()

  // Helper: Direct Line request
  const directLineRequest = useCallback(async <T>(
    method: 'GET' | 'POST',
    url: string,
    token: string,
    body?: unknown
  ): Promise<T> => {
    const response = await http.fetch<T>(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? http.Body.json(body) : undefined
    })
    if (!response.ok) {
      throw new Error(`Direct Line API error: ${response.status}`)
    }
    return response.data
  }, [])

  // Helper: Poll Direct Line activities
  const pollDirectLineActivities = useCallback(async (): Promise<DirectLineActivity[]> => {
    if (!directLineToken.current || !directLineConversationId.current) return []
    
    let url = `${DIRECT_LINE_BASE_URL}/conversations/${directLineConversationId.current}/activities`
    if (directLineWatermark.current) {
      url += `?watermark=${directLineWatermark.current}`
    }
    
    const response = await directLineRequest<DirectLineActivitiesResponse>('GET', url, directLineToken.current)
    if (response.watermark) {
      directLineWatermark.current = response.watermark
    }
    return response.activities || []
  }, [directLineRequest])

  // Initialize Copilot connection (start new or resume existing conversation)
  const connect = useCallback(async (
    existingConversationId?: string | null,
    providerConfig?: ExtendedCopilotConfig | null
  ) => {
    const isAnon = providerConfig?.providerType === 'copilot-studio-anon'
    isAnonymousProvider.current = isAnon
    
    // For anonymous providers, use Direct Line
    if (isAnon) {
      const directLineSecret = providerConfig?.directLineSecret
      if (!directLineSecret) {
        addLog('No Direct Line secret for anonymous Copilot', 'error')
        return { success: false, conversationId: null }
      }
      
      try {
        addLog('Starting anonymous agent conversation via Direct Line...', 'info')
        
        // Generate token from secret
        const tokenResponse = await http.fetch<{ token: string; expires_in: number; conversationId?: string }>(
          `${DIRECT_LINE_BASE_URL}/tokens/generate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${directLineSecret}`,
              'Content-Type': 'application/json'
            }
          }
        )
        
        if (!tokenResponse.ok) {
          throw new Error(`Failed to generate Direct Line token: ${tokenResponse.status}`)
        }
        
        directLineToken.current = tokenResponse.data.token
        addLog('🔑 Direct Line token generated', 'info')
        
        // Start conversation
        const conversation = await directLineRequest<DirectLineConversation>(
          'POST',
          `${DIRECT_LINE_BASE_URL}/conversations`,
          directLineToken.current
        )
        
        directLineConversationId.current = conversation.conversationId
        directLineToken.current = conversation.token // Update token if returned
        directLineWatermark.current = null
        setConversationId(conversation.conversationId)
        
        addLog(`📡 Direct Line conversation started: ${conversation.conversationId.substring(0, 20)}...`, 'info')
        
        // Poll for welcome message
        await new Promise(resolve => setTimeout(resolve, 1000))
        const activities = await pollDirectLineActivities()
        
        for (const activity of activities) {
          if (activity.type === 'message' && activity.text && activity.from?.role === 'bot') {
            addMessage({
              role: 'assistant',
              text: activity.text,
              timestamp: activity.timestamp ? new Date(activity.timestamp) : new Date()
            })
            addLog(`Welcome message: "${activity.text.substring(0, 50)}..."`, 'success')
          }
        }
        
        isInitialized.current = true
        addLog('✅ Connected to anonymous Copilot agent', 'success')
        return { success: true, conversationId: conversation.conversationId }
      } catch (error) {
        addLog(`Anonymous Copilot connection failed: ${error}`, 'error')
        return { success: false, conversationId: null }
      }
    }
    
    // For authenticated providers, require access token
    if (!accessToken) {
      addLog('No access token for Copilot', 'error')
      return { success: false, conversationId: null }
    }

    const baseConfig = config.copilotStudio
    const effectiveConfig: CopilotStudioConfig = {
      clientId: providerConfig?.clientId || baseConfig.clientId,
      appClientId: providerConfig?.appClientId || baseConfig.appClientId,
      tenantId: providerConfig?.tenantId || baseConfig.tenantId,
      environmentId: providerConfig?.environmentId || baseConfig.environmentId,
      botId: providerConfig?.botId || providerConfig?.agentIdentifier || baseConfig.botId,
      agentIdentifier: providerConfig?.agentIdentifier || baseConfig.agentIdentifier,
      botName: providerConfig?.botName || baseConfig.botName
    }

    if (!effectiveConfig.environmentId || !effectiveConfig.botId) {
      addLog('Missing Copilot Studio bot configuration', 'error')
      return { success: false, conversationId: null }
    }

    try {
      // Initialize the service
      copilotService.initialize({
        clientId: effectiveConfig.clientId || effectiveConfig.appClientId || '',
        tenantId: effectiveConfig.tenantId,
        environmentId: effectiveConfig.environmentId,
        botId: effectiveConfig.botId || effectiveConfig.agentIdentifier || ''
      })

      // If we have an existing conversation ID, resume it
      if (existingConversationId) {
        addLog(`Resuming existing conversation: ${existingConversationId.substring(0, 20)}...`, 'info')
        await copilotService.resumeConversation(existingConversationId)
        setConversationId(existingConversationId)
        isInitialized.current = true
        addLog('Conversation resumed', 'success')
        return { success: true, conversationId: existingConversationId }
      }

      // Start new conversation
      addLog('Starting new agent conversation...', 'info')
      const response = await copilotService.startConversation()
      
      if (response.conversationId) {
        setConversationId(response.conversationId)
      }

      // Add welcome message if present
      if (response.text) {
        addMessage({
          role: 'assistant',
          text: response.text,
          timestamp: new Date()
        })
      }

      isInitialized.current = true
      addLog('Connected to Copilot agent', 'success')
      return { success: true, conversationId: response.conversationId }
    } catch (error) {
      addLog(`Copilot connection failed: ${error}`, 'error')
      return { success: false, conversationId: null }
    }
  }, [accessToken, config.copilotStudio, addLog, setConversationId, addMessage, directLineRequest, pollDirectLineActivities])

  // Send message to agent with optional context
  const sendMessage = useCallback(async (
    text: string, 
    speaker?: string,
    context?: MessageContext
  ) => {
    if (!isInitialized.current) {
      addLog('Copilot not connected', 'error')
      return null
    }

    try {
      setIsProcessing(true)
      
      // Add user message to store
      addMessage({
        role: 'user',
        text: text,
        timestamp: new Date()
      })

      // Track question for analytics
      if (speaker) {
        analyticsService.trackQuestion(speaker, text)
      }

      addLog(`Sending to agent: ${text.substring(0, 50)}...`, 'info')
      
      // For anonymous providers, use Direct Line
      if (isAnonymousProvider.current) {
        if (!directLineToken.current || !directLineConversationId.current) {
          throw new Error('Direct Line not connected')
        }
        
        // Send message via Direct Line
        const activity: DirectLineActivity = {
          type: 'message',
          from: { id: 'user', name: speaker || 'User' },
          text
        }
        
        await directLineRequest<void>(
          'POST',
          `${DIRECT_LINE_BASE_URL}/conversations/${directLineConversationId.current}/activities`,
          directLineToken.current,
          activity
        )
        
        // Poll for response with retry
        let responseText: string | null = null
        let attempts = 0
        const maxAttempts = 30 // 15 seconds max wait
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500))
          attempts++
          
          const activities = await pollDirectLineActivities()
          
          for (const act of activities) {
            if (act.type === 'message' && act.text && act.from?.role === 'bot') {
              responseText = act.text
              addMessage({
                role: 'assistant',
                text: act.text,
                timestamp: act.timestamp ? new Date(act.timestamp) : new Date()
              })
              analyticsService.trackResponse(act.text)
            }
          }
          
          if (responseText) break
        }
        
        setIsProcessing(false)
        return responseText ? { text: responseText } : null
      }
      
      // For authenticated providers, use CopilotService
      const responses = await copilotService.sendMessage(text, context)
      
      // Add agent responses - sendMessage returns an array of MessageResponse
      for (const response of responses) {
        if (response.text) {
          addMessage({
            role: 'assistant',
            text: response.text,
            timestamp: new Date()
          })
          analyticsService.trackResponse(response.text)
        }
      }
      
      setIsProcessing(false)
      return responses.length > 0 ? responses[0] : null
    } catch (error) {
      setIsProcessing(false)
      addLog(`Send failed: ${error}`, 'error')
      return null
    }
  }, [addLog, addMessage, setIsProcessing, directLineRequest, pollDirectLineActivities])

  // Get last response
  const getLastResponse = useCallback(() => {
    return copilotService.getLastResponse()
  }, [])

  // Disconnect
  const disconnect = useCallback(() => {
    if (isAnonymousProvider.current) {
      directLineToken.current = null
      directLineConversationId.current = null
      directLineWatermark.current = null
    } else {
      copilotService.endConversation()
    }
    clearMessages()
    setConversationId(null)
    isInitialized.current = false
    isAnonymousProvider.current = false
    addLog('Disconnected from Copilot agent', 'info')
  }, [clearMessages, setConversationId, addLog])

  return {
    connect,
    sendMessage,
    disconnect,
    getLastResponse,
    isConnected: isInitialized.current,
    isProcessing,
    conversationId
  }
}
