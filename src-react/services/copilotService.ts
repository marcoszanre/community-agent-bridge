// Copilot Studio Service
// Handles agent conversation using @microsoft/agents-copilotstudio-client

import { ConnectionSettings, CopilotStudioClient } from '@microsoft/agents-copilotstudio-client'
import { getCopilotAuthService } from './copilotAuthService'
import type { CopilotStudioConfig } from '@/types'

// Types for Copilot Studio activities
interface Activity {
  type: string
  text?: string
  conversation?: { id: string }
  suggestedActions?: {
    actions: SuggestedAction[]
  }
}

interface SuggestedAction {
  type: string
  title: string
  value: string
}

interface ConversationResponse {
  conversationId: string | null
  text: string | null
  suggestedActions: SuggestedAction[] | null
  activities: Activity[]
}

interface MessageResponse {
  text: string
  suggestedActions: SuggestedAction[] | null
}

// Context to include with messages
interface MessageContext {
  captions?: { speaker: string; text: string }[]
  chatMessages?: { sender: string; text: string }[]
}

/**
 * CopilotService - Manages conversations with Copilot Studio agents
 */
export class CopilotService {
  private client: CopilotStudioClient | null = null
  private conversationId: string | null = null
  private settings: ConnectionSettings | null = null
  private isActive = false
  private lastResponse: MessageResponse | null = null

  /**
   * Initialize the service with configuration
   */
  initialize(config: CopilotStudioConfig): void {
    this.settings = new ConnectionSettings({
      appClientId: config.clientId,
      tenantId: config.tenantId,
      environmentId: config.environmentId,
      agentIdentifier: config.botId
    })
    
    console.log('CopilotService initialized with settings:', {
      environmentId: config.environmentId,
      botId: config.botId,
      tenantId: config.tenantId
    })
  }

  /**
   * Start a new conversation with the agent
   */
  async startConversation(): Promise<ConversationResponse> {
    if (!this.settings) {
      throw new Error('CopilotService not initialized. Call initialize() first.')
    }

    console.log('Starting conversation with Copilot Studio agent...')
    
    // Get access token from auth service
    const authService = getCopilotAuthService()
    const token = await authService.getToken()
    
    if (!token) {
      throw new Error('No access token available. Please sign in first.')
    }
    
    console.log('Got access token, creating CopilotStudioClient...')
    
    // Create client with token
    this.client = new CopilotStudioClient(this.settings, token)
    console.log('CopilotStudioClient created')
    
    // Start conversation - returns array of activities
    console.log('Calling startConversationAsync...')
    const activities = await this.client.startConversationAsync(true) as Activity[]
    
    console.log('Received activities:', activities)
    
    // Find the welcome message activity
    let welcomeText: string | null = null
    let suggestedActions: SuggestedAction[] | null = null
    
    for (const activity of activities) {
      console.log('Processing activity type:', activity.type)
      
      if (activity.type === 'message' && activity.text) {
        welcomeText = activity.text
        suggestedActions = activity.suggestedActions?.actions || null
        this.conversationId = activity.conversation?.id || null
        console.log('Found welcome message:', welcomeText)
        console.log('Conversation ID:', this.conversationId)
      }
    }
    
    this.isActive = true
    
    return {
      conversationId: this.conversationId,
      text: welcomeText,
      suggestedActions,
      activities
    }
  }

  /**
   * Resume an existing conversation (re-initialize client without starting new conversation)
   */
  async resumeConversation(existingConversationId: string): Promise<boolean> {
    if (!this.settings) {
      throw new Error('CopilotService not initialized. Call initialize() first.')
    }

    console.log('Resuming conversation:', existingConversationId)
    
    // Get access token from auth service
    const authService = getCopilotAuthService()
    const token = await authService.getToken()
    
    if (!token) {
      throw new Error('No access token available. Please sign in first.')
    }
    
    // Create client with token
    this.client = new CopilotStudioClient(this.settings, token)
    this.conversationId = existingConversationId
    this.isActive = true
    
    console.log('Conversation resumed with ID:', this.conversationId)
    return true
  }

  /**
   * Send a message to the agent and get responses
   * @param text - The message text
   * @param context - Optional context (captions, chat messages) to include
   */
  async sendMessage(text: string, context?: MessageContext): Promise<MessageResponse[]> {
    if (!this.client) {
      throw new Error('No active conversation. Start a conversation first.')
    }
    
    console.log('Sending message to agent:', text)
    
    // Build the full message with context
    let fullMessage = text
    
    if (context) {
      const contextParts: string[] = []
      
      if (context.captions && context.captions.length > 0) {
        // Include last 10 captions as context
        const recentCaptions = context.captions.slice(-10)
        const captionsText = recentCaptions.map(c => `${c.speaker}: ${c.text}`).join('\n')
        contextParts.push(`[Recent meeting captions]\n${captionsText}`)
      }
      
      if (context.chatMessages && context.chatMessages.length > 0) {
        // Include last 10 chat messages as context
        const recentChat = context.chatMessages.slice(-10)
        const chatText = recentChat.map(m => `${m.sender}: ${m.text}`).join('\n')
        contextParts.push(`[Recent meeting chat]\n${chatText}`)
      }
      
      if (contextParts.length > 0) {
        fullMessage = `${contextParts.join('\n\n')}\n\n[Current message]\n${text}`
        console.log('Message with context:', fullMessage.substring(0, 200) + '...')
      }
    }
    
    // Ask the agent with the full message (including context)
    const replies = await this.client.askQuestionAsync(fullMessage, this.conversationId || undefined) as Activity[]
    
    console.log('Received', replies.length, 'activities in response')
    
    // Process and return text responses
    const responses: MessageResponse[] = []
    
    for (const activity of replies) {
      console.log('Activity type:', activity.type, 'Text:', activity.text)
      
      if (activity.type === 'message' && activity.text) {
        const response: MessageResponse = {
          text: activity.text,
          suggestedActions: activity.suggestedActions?.actions || null
        }
        responses.push(response)
        this.lastResponse = response  // Store last response
      } else if (activity.type === 'endOfConversation') {
        console.log('Conversation ended by agent')
        this.isActive = false
      }
    }
    
    return responses
  }

  /**
   * End the current conversation
   */
  endConversation(): void {
    this.client = null
    this.conversationId = null
    this.isActive = false
    this.lastResponse = null
    console.log('Conversation ended')
  }

  /**
   * Get the last response from the agent
   */
  getLastResponse(): MessageResponse | null {
    return this.lastResponse
  }

  /**
   * Check if conversation is active
   */
  isConversationActive(): boolean {
    return this.isActive && this.client !== null
  }

  /**
   * Get the current conversation ID
   */
  getConversationId(): string | null {
    return this.conversationId
  }
}

// Singleton instance
let instance: CopilotService | null = null

/**
 * Get or create the CopilotService instance
 */
export function getCopilotService(): CopilotService {
  if (!instance) {
    instance = new CopilotService()
  }
  return instance
}

/**
 * Initialize the CopilotService with config
 */
export function initCopilotService(config: CopilotStudioConfig): CopilotService {
  const service = getCopilotService()
  service.initialize(config)
  return service
}
