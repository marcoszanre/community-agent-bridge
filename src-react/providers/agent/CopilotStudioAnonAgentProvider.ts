// ============================================
// Copilot Studio Anonymous Agent Provider
// Agent provider implementation for Microsoft Copilot Studio
// Uses Direct Line API for anonymous access (no user authentication required)
// ============================================

import { http } from '@tauri-apps/api'

import { BaseProvider } from '../core/BaseProvider'
import type {
  CopilotStudioAnonAgentConfig,
  IAgentProvider,
  AgentProviderType,
  AgentConnectionState,
  AgentMessage,
  AgentConversation,
  AgentResponse,
  AgentSuggestedAction,
  AgentProviderCallbacks,
  ProviderAuthState,
  ProviderRegistration
} from '@/types/providers'

// Direct Line API types
interface DirectLineToken {
  token: string
  expires_in: number
  conversationId?: string
}

interface DirectLineActivity {
  type: string
  id?: string
  timestamp?: string
  channelId?: string
  from?: {
    id: string
    name?: string
    role?: string
  }
  conversation?: {
    id: string
  }
  membersAdded?: Array<{
    id: string
    name?: string
  }>
  text?: string
  suggestedActions?: {
    actions: Array<{
      type: string
      title: string
      value: string
    }>
  }
  attachments?: Array<{
    contentType: string
    content?: unknown
    contentUrl?: string
    name?: string
  }>
}

interface DirectLineConversation {
  conversationId: string
  token: string
  expires_in: number
  streamUrl?: string
}

interface DirectLineActivitiesResponse {
  activities: DirectLineActivity[]
  watermark?: string
}

// Direct Line API base URL
const DIRECT_LINE_BASE_URL = 'https://directline.botframework.com/v3/directline'

/**
 * HTTP helper for Direct Line API calls
 */
async function directLineRequest<T>(
  method: 'GET' | 'POST',
  url: string,
  token: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }

  console.log(`🔗 Direct Line ${method}: ${url}`, body ? JSON.stringify(body).slice(0, 200) : '')

  const response = await http.fetch<T>(url, {
    method,
    headers,
    body: body ? http.Body.json(body) : undefined
  })

  console.log(`📨 Direct Line Response: ${response.status}`, JSON.stringify(response.data).slice(0, 500))

  if (!response.ok) {
    throw new Error(`Direct Line API error: ${response.status}`)
  }

  return response.data
}

/**
 * Copilot Studio Anonymous Agent Provider
 * Uses Direct Line API for communication without user authentication
 */
export class CopilotStudioAnonAgentProvider
  extends BaseProvider<CopilotStudioAnonAgentConfig>
  implements IAgentProvider {

  readonly type = 'copilot-studio-anon'
  readonly category = 'agent' as const
  readonly providerType: AgentProviderType = 'copilot-studio-anon'

  private callbacks: AgentProviderCallbacks = {}
  
  private _connectionState: AgentConnectionState = 'disconnected'
  private _conversation: AgentConversation | null = null
  private _authState: ProviderAuthState | null = null

  // Direct Line state
  private directLineToken: string | null = null
  private directLineConversationId: string | null = null
  private tokenExpiresAt: Date | null = null
  private watermark: string | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null

  get connectionState(): AgentConnectionState {
    return this._connectionState
  }

  get conversation(): AgentConversation | null {
    return this._conversation
  }

  get authState(): ProviderAuthState | null {
    return this._authState
  }

  /**
   * Initialize the provider
   */
  protected async onInitialize(config: CopilotStudioAnonAgentConfig): Promise<void> {
    console.log('🤖 Initializing Copilot Studio Anonymous Agent Provider...')
    
    const { directLineSecret } = config.settings
    
    if (!directLineSecret) {
      throw new Error('Copilot Studio Anonymous configuration incomplete: directLineSecret is required')
    }

    // For anonymous providers, we're always "authenticated" (no auth required)
    this._authState = {
      isAuthenticated: true,
      isAuthenticating: false
    }

    console.log('🤖 Copilot Studio Anonymous Agent Provider initialized')
  }

  /**
   * Set callbacks for events
   */
  setCallbacks(callbacks: AgentProviderCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Authenticate - for anonymous providers, this just validates the token endpoint
   */
  async authenticate(): Promise<ProviderAuthState> {
    if (!this.config) {
      throw new Error('Provider not initialized')
    }

    // For anonymous providers, we don't need user authentication
    // Just verify we can get a Direct Line token
    this.setStatus('authenticating')

    try {
      await this.refreshDirectLineToken()

      this._authState = {
        isAuthenticated: true,
        isAuthenticating: false
      }
      
      this.setStatus('ready')
      this.callbacks.onAuthStateChanged?.(this._authState)
      return this._authState

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get Direct Line token'
      this._authState = {
        isAuthenticated: false,
        isAuthenticating: false,
        error: errorMessage
      }
      this.setStatus('error')
      this.setError(errorMessage)
      this.callbacks.onAuthStateChanged?.(this._authState)
      throw error
    }
  }

  /**
   * Get Direct Line token by exchanging secret
   * Uses official Microsoft Direct Line API: https://directline.botframework.com/v3/directline/tokens/generate
   */
  private async refreshDirectLineToken(): Promise<void> {
    if (!this.config) {
      throw new Error('Provider not initialized')
    }

    const { directLineSecret } = this.config.settings

    try {
      // Exchange secret for token using official Direct Line API
      const response = await http.fetch<DirectLineToken>(
        `${DIRECT_LINE_BASE_URL}/tokens/generate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${directLineSecret}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to generate Direct Line token: ${response.status}`)
      }

      const tokenData = response.data
      this.directLineToken = tokenData.token
      this.tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000))
      
      if (tokenData.conversationId) {
        this.directLineConversationId = tokenData.conversationId
      }

      console.log('🔑 Direct Line token generated from secret')
    } catch (error) {
      console.error('❌ Failed to generate Direct Line token:', error)
      throw error
    }
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this._authState?.isAuthenticated ?? false
  }

  /**
   * Check if token is expiring soon (within 5 minutes)
   */
  private isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) return true
    return this.tokenExpiresAt.getTime() < Date.now() + (5 * 60 * 1000)
  }

  /**
   * Start a new conversation
   */
  async startConversation(): Promise<AgentResponse> {
    if (!this.config) {
      throw new Error('Provider not initialized')
    }

    this.setConnectionState('connecting')

    try {
      // Get fresh token if needed
      if (!this.directLineToken || this.isTokenExpiringSoon()) {
        await this.refreshDirectLineToken()
      }

      // Start Direct Line conversation
      const conversation = await directLineRequest<DirectLineConversation>(
        'POST',
        `${DIRECT_LINE_BASE_URL}/conversations`,
        this.directLineToken!
      )

      this.directLineConversationId = conversation.conversationId
      this.directLineToken = conversation.token // Update token if returned
      this.watermark = null

      // Per Microsoft Direct Line docs, send conversationUpdate activity to trigger bot welcome
      // https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-start-conversation
      const memberId = `dl_${this.directLineConversationId.slice(0, 8)}`
      const conversationUpdateActivity: DirectLineActivity = {
        type: 'conversationUpdate',
        from: { 
          id: memberId,
          name: 'User',
          role: 'user'
        },
        membersAdded: [{ id: memberId, name: 'User' }]
      }

      try {
        await directLineRequest<void>(
          'POST',
          `${DIRECT_LINE_BASE_URL}/conversations/${this.directLineConversationId}/activities`,
          this.directLineToken,
          conversationUpdateActivity
        )
        console.log('📤 Sent conversationUpdate to trigger bot welcome')
      } catch (err) {
        console.warn('⚠️ conversationUpdate failed (bot may not send welcome):', err)
      }

      // Give bot time to process and send welcome message
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Poll for initial welcome message
      const activities = await this.pollActivities()
      
      const messages: AgentMessage[] = []
      let suggestedActions: AgentSuggestedAction[] | undefined

      for (const activity of activities) {
        if (activity.type === 'message' && activity.text && activity.from?.role === 'bot') {
          const message = this.activityToMessage(activity)
          messages.push(message)
          this.callbacks.onMessageReceived?.(message)
          suggestedActions = message.suggestedActions
        }
      }

      // Create conversation record
      this._conversation = {
        id: this.directLineConversationId,
        startedAt: new Date(),
        lastActivityAt: new Date(),
        messages,
        isActive: true
      }

      this.setConnectionState('connected')
      this.setStatus('connected')
      this.callbacks.onConversationStarted?.(this._conversation)

      return {
        conversationId: this.directLineConversationId,
        messages,
        suggestedActions
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start conversation'
      this.setConnectionState('error')
      this.setError(message)
      throw error
    }
  }

  /**
   * Convert Direct Line activity to AgentMessage
   */
  private activityToMessage(activity: DirectLineActivity): AgentMessage {
    return {
      id: activity.id || crypto.randomUUID(),
      role: activity.from?.role === 'bot' ? 'assistant' : 'user',
      content: activity.text || '',
      timestamp: activity.timestamp ? new Date(activity.timestamp) : new Date(),
      suggestedActions: activity.suggestedActions?.actions.map(a => ({
        type: 'button' as const,
        title: a.title,
        value: a.value
      }))
    }
  }

  /**
   * Poll for new activities
   */
  private async pollActivities(): Promise<DirectLineActivity[]> {
    if (!this.directLineToken || !this.directLineConversationId) {
      return []
    }

    let url = `${DIRECT_LINE_BASE_URL}/conversations/${this.directLineConversationId}/activities`
    if (this.watermark) {
      url += `?watermark=${this.watermark}`
    }

    const response = await directLineRequest<DirectLineActivitiesResponse>(
      'GET',
      url,
      this.directLineToken
    )

    if (response.watermark) {
      this.watermark = response.watermark
    }

    return response.activities || []
  }

  /**
   * Send a message to the agent
   */
  async sendMessage(text: string): Promise<AgentResponse> {
    if (!this.directLineToken || !this.directLineConversationId) {
      throw new Error('No active conversation. Call startConversation() first.')
    }

    // Refresh token if needed
    if (this.isTokenExpiringSoon()) {
      await this.refreshDirectLineToken()
    }

    // Add user message to conversation
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date()
    }

    if (this._conversation) {
      this._conversation.messages.push(userMessage)
      this._conversation.lastActivityAt = new Date()
    }

    try {
      this.callbacks.onTyping?.()

      // Send message via Direct Line
      // The from.id should be consistent within a conversation but unique per user
      const activity: DirectLineActivity = {
        type: 'message',
        from: { 
          id: `dl_${this.directLineConversationId?.slice(0, 8) || 'user'}`,
          name: 'User',
          role: 'user'
        },
        text
      }

      await directLineRequest<void>(
        'POST',
        `${DIRECT_LINE_BASE_URL}/conversations/${this.directLineConversationId}/activities`,
        this.directLineToken,
        activity
      )

      // Poll for response with retry
      const messages: AgentMessage[] = []
      let suggestedActions: AgentSuggestedAction[] | undefined
      let endOfConversation = false
      let attempts = 0
      const maxAttempts = 30 // 15 seconds max wait

      console.log('🔄 Polling for bot response...')

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500))
        attempts++

        const activities = await this.pollActivities()
        
        console.log(`📥 Poll attempt ${attempts}: got ${activities.length} activities`)
        
        for (const act of activities) {
          console.log(`   Activity: type=${act.type}, from=${act.from?.role}, text=${act.text?.slice(0, 100)}`)
          
          if (act.type === 'message' && act.text && act.from?.role === 'bot') {
            const message = this.activityToMessage(act)
            messages.push(message)

            if (this._conversation) {
              this._conversation.messages.push(message)
            }

            this.callbacks.onMessageReceived?.(message)
            suggestedActions = message.suggestedActions
          } else if (act.type === 'endOfConversation') {
            endOfConversation = true
            if (this._conversation) {
              this._conversation.isActive = false
            }
          }
        }

        // If we got bot messages, we're done polling
        if (messages.length > 0 || endOfConversation) {
          break
        }
      }

      console.log(`✅ Finished polling: ${messages.length} messages, endOfConversation=${endOfConversation}`)

      if (this._conversation) {
        this._conversation.lastActivityAt = new Date()
      }

      return {
        conversationId: this._conversation?.id || null,
        messages,
        suggestedActions,
        endOfConversation
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message'
      this.callbacks.onError?.(new Error(message))
      throw error
    }
  }

  /**
   * Send a suggested action
   */
  async sendAction(action: AgentSuggestedAction): Promise<AgentResponse> {
    return this.sendMessage(action.value)
  }

  /**
   * End the current conversation
   */
  async endConversation(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    if (this._conversation) {
      this._conversation.isActive = false
      const conversationId = this._conversation.id
      this._conversation = null
      this.callbacks.onConversationEnded?.(conversationId)
    }

    this.directLineToken = null
    this.directLineConversationId = null
    this.watermark = null
    this.setConnectionState('disconnected')
  }

  /**
   * Get conversation history
   */
  getHistory(): AgentMessage[] {
    return this._conversation?.messages || []
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    if (this._conversation) {
      this._conversation.messages = []
    }
  }

  /**
   * Dispose the provider
   */
  protected async onDispose(): Promise<void> {
    await this.endConversation()
    this._authState = null
  }

  /**
   * Set connection state
   */
  private setConnectionState(state: AgentConnectionState): void {
    if (this._connectionState !== state) {
      this._connectionState = state
      this.callbacks.onConnectionStateChanged?.(state)
      this.notifyStateChange()
    }
  }
}

/**
 * Factory function for creating Copilot Studio Anonymous provider
 */
export function createCopilotStudioAnonAgentProvider(
  _config?: Partial<CopilotStudioAnonAgentConfig>
): CopilotStudioAnonAgentProvider {
  return new CopilotStudioAnonAgentProvider()
}

/**
 * Provider registration
 */
export const copilotStudioAnonAgentProviderRegistration: ProviderRegistration<
  CopilotStudioAnonAgentProvider,
  CopilotStudioAnonAgentConfig
> = {
  type: 'copilot-studio-anon',
  category: 'agent',
  displayName: 'Copilot Studio (Anonymous)',
  description: 'Microsoft Copilot Studio agents without user authentication (Direct Line)',
  factory: createCopilotStudioAnonAgentProvider,
  capabilities: ['chat', 'suggested-actions'],
  requiredSettings: ['directLineSecret'],
  defaultConfig: {
    type: 'copilot-studio-anon',
    category: 'agent',
    authType: 'none'
  }
}
