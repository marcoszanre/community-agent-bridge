// Teams Meeting Chat Service
// Manages chat functionality within Teams meetings using ACS Chat SDK

import { ChatClient, ChatThreadClient } from '@azure/communication-chat'
import { AzureCommunicationTokenCredential, CommunicationIdentifierKind } from '@azure/communication-common'

export interface MeetingChatMessage {
  id: string
  content: string
  senderDisplayName: string
  senderId: string
  createdOn: Date
  isOwn: boolean
}

export interface ChatServiceCallbacks {
  onMessageReceived?: (message: MeetingChatMessage) => void
  onMessageSent?: (message: MeetingChatMessage) => void
  onError?: (error: string) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

/**
 * Extract communication user ID from sender identifier
 */
function getSenderId(sender: CommunicationIdentifierKind | undefined): string {
  if (!sender) return ''
  if ('communicationUserId' in sender) {
    return sender.communicationUserId
  }
  if ('microsoftTeamsUserId' in sender) {
    return sender.microsoftTeamsUserId
  }
  if ('phoneNumber' in sender) {
    return sender.phoneNumber
  }
  return ''
}

/**
 * Teams Meeting Chat Service
 * Handles chat interop with Teams meetings
 */
export class MeetingChatService {
  private chatClient: ChatClient | null = null
  private chatThreadClient: ChatThreadClient | null = null
  private threadId: string | null = null
  private userId: string | null = null
  private displayName: string = 'AI Agent'
  private isConnected: boolean = false
  private callbacks: ChatServiceCallbacks = {}

  /**
   * Initialize the chat client with ACS credentials
   */
  async initialize(
    endpoint: string,
    token: string,
    userId: string,
    displayName: string
  ): Promise<boolean> {
    try {
      console.log('Initializing Meeting Chat Service...')
      
      this.userId = userId
      this.displayName = displayName
      
      const tokenCredential = new AzureCommunicationTokenCredential(token)
      this.chatClient = new ChatClient(endpoint, tokenCredential)
      
      console.log('Chat client created successfully')
      return true
    } catch (error) {
      console.error('Failed to initialize chat client:', error)
      this.callbacks.onError?.(`Failed to initialize chat: ${error}`)
      return false
    }
  }

  /**
   * Connect to the meeting chat thread
   * Call this after the call is connected and you have the threadId
   */
  async connectToThread(threadId: string): Promise<boolean> {
    if (!this.chatClient) {
      console.error('Chat client not initialized')
      return false
    }

    try {
      console.log(`Connecting to chat thread: ${threadId}`)
      
      this.threadId = threadId
      this.chatThreadClient = this.chatClient.getChatThreadClient(threadId)
      
      // Start real-time notifications
      await this.chatClient.startRealtimeNotifications()
      
      // Subscribe to new messages
      this.chatClient.on('chatMessageReceived', (event) => {
        // Check if the message is for our thread
        if (event.threadId !== this.threadId) {
          return
        }

        const senderId = getSenderId(event.sender)
        const isOwn = senderId === this.userId
        
        const message: MeetingChatMessage = {
          id: event.id,
          content: event.message || '',
          senderDisplayName: event.senderDisplayName || 'Unknown',
          senderId,
          createdOn: new Date(event.createdOn),
          isOwn
        }

        console.log('Chat message received:', message)
        
        if (isOwn) {
          this.callbacks.onMessageSent?.(message)
        } else {
          this.callbacks.onMessageReceived?.(message)
        }
      })

      this.isConnected = true
      this.callbacks.onConnected?.()
      console.log('Connected to meeting chat thread')
      
      return true
    } catch (error) {
      console.error('Failed to connect to chat thread:', error)
      this.callbacks.onError?.(`Failed to connect to chat: ${error}`)
      return false
    }
  }

  /**
   * Send a message to the meeting chat
   */
  async sendMessage(content: string): Promise<string | null> {
    if (!this.chatThreadClient) {
      console.error('Not connected to chat thread')
      return null
    }

    try {
      const sendMessageRequest = { content }
      const sendMessageOptions = { senderDisplayName: this.displayName }
      
      const result = await this.chatThreadClient.sendMessage(
        sendMessageRequest,
        sendMessageOptions
      )
      
      console.log(`Message sent with id: ${result.id}`)
      
      // Notify that we sent a message so it appears in the local chat UI
      const sentMessage: MeetingChatMessage = {
        id: result.id,
        content,
        senderDisplayName: this.displayName,
        senderId: this.userId || '',
        createdOn: new Date(),
        isOwn: true
      }
      this.callbacks.onMessageSent?.(sentMessage)
      
      return result.id
    } catch (error) {
      console.error('Failed to send message:', error)
      this.callbacks.onError?.(`Failed to send message: ${error}`)
      return null
    }
  }

  /**
   * Get chat history (messages sent before joining)
   * Note: ACS users can only see messages sent after they joined
   */
  async getMessages(maxMessages: number = 50): Promise<MeetingChatMessage[]> {
    if (!this.chatThreadClient) {
      console.error('Not connected to chat thread')
      return []
    }

    try {
      const messages: MeetingChatMessage[] = []
      const messagesIterator = this.chatThreadClient.listMessages({ maxPageSize: maxMessages })
      
      for await (const page of messagesIterator.byPage()) {
        for (const chatMessage of page) {
          // Only include text messages (not system messages)
          if (chatMessage.type === 'text' && chatMessage.content?.message) {
            const senderId = getSenderId(chatMessage.sender as CommunicationIdentifierKind | undefined)
            const isOwn = senderId === this.userId
            
            messages.push({
              id: chatMessage.id,
              content: chatMessage.content.message,
              senderDisplayName: chatMessage.senderDisplayName || 'Unknown',
              senderId,
              createdOn: chatMessage.createdOn,
              isOwn
            })
          }
        }
      }
      
      // Return in chronological order
      return messages.reverse()
    } catch (error) {
      console.error('Failed to get messages:', error)
      return []
    }
  }

  /**
   * Set callbacks for chat events
   */
  setCallbacks(callbacks: ChatServiceCallbacks): void {
    this.callbacks = callbacks
  }

  /**
   * Check if connected to chat
   */
  isConnectedToChat(): boolean {
    return this.isConnected && this.chatThreadClient !== null
  }

  /**
   * Get the current thread ID
   */
  getThreadId(): string | null {
    return this.threadId
  }

  /**
   * Disconnect from chat
   */
  async disconnect(): Promise<void> {
    try {
      if (this.chatClient) {
        await this.chatClient.stopRealtimeNotifications()
      }
    } catch (error) {
      console.error('Error stopping notifications:', error)
    }

    this.isConnected = false
    this.chatThreadClient = null
    this.threadId = null
    this.callbacks.onDisconnected?.()
    console.log('Disconnected from meeting chat')
  }

  /**
   * Dispose of the service
   */
  dispose(): void {
    this.disconnect()
    this.chatClient = null
    this.userId = null
  }
}

// Singleton instance
let instance: MeetingChatService | null = null

export function getMeetingChatService(): MeetingChatService {
  if (!instance) {
    instance = new MeetingChatService()
  }
  return instance
}
