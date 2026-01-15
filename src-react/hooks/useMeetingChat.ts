// useMeetingChat - React hook for Teams meeting chat integration

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { getMeetingChatService, type MeetingChatMessage } from '@/services/chatService'

export interface MeetingChatState {
  messages: MeetingChatMessage[]
  isConnected: boolean
  isConnecting: boolean
  error: string | null
}

export function useMeetingChat() {
  const chatService = getMeetingChatService()
  const { addLog } = useAppStore()
  
  const [state, setState] = useState<MeetingChatState>({
    messages: [],
    isConnected: false,
    isConnecting: false,
    error: null
  })
  
  const isInitialized = useRef(false)
  const endpoint = useRef<string | null>(null)
  const userId = useRef<string | null>(null)

  // Set up chat service callbacks
  useEffect(() => {
    chatService.setCallbacks({
      onMessageReceived: (message) => {
        addLog(`💬 Chat from ${message.senderDisplayName}: "${message.content.substring(0, 50)}..."`, 'info')
        setState(prev => {
          // Deduplicate - check if message already exists
          if (prev.messages.some(m => m.id === message.id)) {
            return prev
          }
          return {
            ...prev,
            messages: [...prev.messages, message]
          }
        })
      },
      onMessageSent: (message) => {
        setState(prev => {
          // Deduplicate - check if message already exists
          if (prev.messages.some(m => m.id === message.id)) {
            return prev
          }
          return {
            ...prev,
            messages: [...prev.messages, message]
          }
        })
      },
      onConnected: () => {
        addLog('Connected to meeting chat', 'success')
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null
        }))
      },
      onDisconnected: () => {
        addLog('Disconnected from meeting chat', 'info')
        setState(prev => ({
          ...prev,
          isConnected: false,
          messages: []
        }))
      },
      onError: (error) => {
        addLog(`Chat error: ${error}`, 'error')
        setState(prev => ({
          ...prev,
          error,
          isConnecting: false
        }))
      }
    })
    
    return () => {
      chatService.dispose()
    }
  }, [addLog])

  // Initialize the chat client (call once with ACS credentials)
  const initialize = useCallback(async (
    acsEndpoint: string,
    token: string,
    acsUserId: string,
    displayName: string
  ): Promise<boolean> => {
    if (isInitialized.current) {
      addLog('Chat service already initialized', 'warning')
      return true
    }

    try {
      addLog('Initializing meeting chat service...', 'info')
      
      const success = await chatService.initialize(acsEndpoint, token, acsUserId, displayName)
      if (success) {
        isInitialized.current = true
        endpoint.current = acsEndpoint
        userId.current = acsUserId
        addLog('Meeting chat service initialized', 'success')
        return true
      }
      return false
    } catch (error) {
      addLog(`Failed to initialize chat: ${error}`, 'error')
      return false
    }
  }, [addLog])

  // Connect to a meeting's chat thread
  const connectToThread = useCallback(async (threadId: string): Promise<boolean> => {
    if (!isInitialized.current) {
      addLog('Chat service not initialized - cannot connect to thread', 'error')
      return false
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }))

    try {
      addLog(`Connecting to chat thread: ${threadId.substring(0, 20)}...`, 'info')
      
      const success = await chatService.connectToThread(threadId)
      if (success) {
        // Load existing messages
        const messages = await chatService.getMessages()
        setState(prev => ({
          ...prev,
          messages,
          isConnected: true,
          isConnecting: false
        }))
        addLog(`Loaded ${messages.length} chat messages`, 'info')
        return true
      }
      
      setState(prev => ({ ...prev, isConnecting: false, error: 'Failed to connect' }))
      return false
    } catch (error) {
      addLog(`Failed to connect to chat thread: ${error}`, 'error')
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: `Connection failed: ${error}`
      }))
      return false
    }
  }, [addLog])

  // Send a message to the chat
  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!state.isConnected) {
      addLog('Cannot send - not connected to chat', 'error')
      return false
    }

    try {
      const messageId = await chatService.sendMessage(content)
      if (messageId) {
        addLog(`Sent chat message`, 'success')
        return true
      }
      return false
    } catch (error) {
      addLog(`Failed to send message: ${error}`, 'error')
      return false
    }
  }, [state.isConnected, addLog])

  // Disconnect from chat
  const disconnect = useCallback(async () => {
    await chatService.disconnect()
    setState({
      messages: [],
      isConnected: false,
      isConnecting: false,
      error: null
    })
  }, [])

  return {
    ...state,
    initialize,
    connectToThread,
    sendMessage,
    disconnect
  }
}
