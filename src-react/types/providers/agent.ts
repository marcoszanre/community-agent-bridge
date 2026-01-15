// ============================================
// Agent Provider Types
// Interfaces for AI agents (Copilot Studio, Foundry, etc.)
// ============================================

import type { 
  BaseProviderConfig, 
  IProvider,
  ProviderAuthState 
} from './base'

/**
 * Agent provider types
 */
export type AgentProviderType = 
  | 'copilot-studio'       // Microsoft Copilot Studio (authenticated)
  | 'copilot-studio-anon'  // Microsoft Copilot Studio (anonymous/Direct Line)
  | 'azure-foundry'        // Azure AI Foundry agents
  | 'azure-openai'         // Direct Azure OpenAI
  | 'openai'               // OpenAI API
  | 'semantic-kernel'      // Semantic Kernel agents
  | 'langchain'            // LangChain agents
  | 'custom'               // Custom agent implementation

/**
 * Agent connection state
 */
export type AgentConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

/**
 * Conversation message role
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'function'

/**
 * Suggested action from agent
 */
export interface AgentSuggestedAction {
  type: 'button' | 'link' | 'imBack' | 'postBack'
  title: string
  value: string
  displayText?: string
}

/**
 * Agent message
 */
export interface AgentMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
  /** Suggested actions/quick replies */
  suggestedActions?: AgentSuggestedAction[]
  /** Attachments (images, files, etc.) */
  attachments?: AgentAttachment[]
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Agent attachment
 */
export interface AgentAttachment {
  id: string
  contentType: string
  name?: string
  contentUrl?: string
  content?: unknown
  thumbnailUrl?: string
}

/**
 * Agent conversation
 */
export interface AgentConversation {
  id: string
  startedAt: Date
  lastActivityAt: Date
  messages: AgentMessage[]
  isActive: boolean
}

/**
 * Agent response
 */
export interface AgentResponse {
  conversationId: string | null
  messages: AgentMessage[]
  suggestedActions?: AgentSuggestedAction[]
  endOfConversation?: boolean
}

/**
 * Agent provider configuration
 */
export interface AgentProviderConfig extends BaseProviderConfig {
  category: 'agent'
  settings: {
    /** Agent/bot identifier */
    agentId?: string
    /** Agent name for display */
    agentName?: string
    /** System prompt for LLM-based agents */
    systemPrompt?: string
    /** API endpoint */
    endpoint?: string
    /** API key */
    apiKey?: string
    /** Additional provider-specific settings */
    [key: string]: unknown
  }
  /** Pre-processing configuration */
  preprocessing?: {
    enabled: boolean
    processorId?: string
    options?: Record<string, unknown>
  }
  /** Post-processing configuration */
  postprocessing?: {
    enabled: boolean
    processorId?: string
    options?: Record<string, unknown>
  }
}

/**
 * Copilot Studio specific configuration (authenticated)
 */
export interface CopilotStudioAgentConfig extends AgentProviderConfig {
  type: 'copilot-studio'
  authType: 'device-code'
  settings: AgentProviderConfig['settings'] & {
    clientId: string
    tenantId: string
    environmentId: string
    botId: string
    botName?: string
  }
}

/**
 * Copilot Studio anonymous configuration (Direct Line)
 * Uses Direct Line secret for anonymous access without user authentication
 */
export interface CopilotStudioAnonAgentConfig extends AgentProviderConfig {
  type: 'copilot-studio-anon'
  authType: 'none'
  settings: AgentProviderConfig['settings'] & {
    /** Direct Line secret from Copilot Studio (Settings > Security > Web channel security) */
    directLineSecret: string
    /** Optional bot name for display */
    botName?: string
  }
}

/**
 * Azure Foundry specific configuration
 * Uses Azure AI Projects REST API with Azure AD Service Principal authentication
 */
export interface AzureFoundryAgentConfig extends AgentProviderConfig {
  type: 'azure-foundry'
  authType: 'api-key' | 'service-principal'
  settings: AgentProviderConfig['settings'] & {
    /** AI Project endpoint URL (e.g., https://xxx.services.ai.azure.com/api/projects/xxx) */
    projectEndpoint: string
    /** Agent ID from Foundry (e.g., CAB-Foundry:2) */
    agentName: string
    /** API key for authentication (when authType is 'api-key') */
    apiKey?: string
    /** Azure AD Tenant ID (when authType is 'service-principal') */
    tenantId?: string
    /** Service Principal Client ID (when authType is 'service-principal') */
    clientId?: string
    /** Service Principal Client Secret (when authType is 'service-principal') */
    clientSecret?: string
    /** Azure region (e.g., eastus2) */
    region: string
    /** Optional display name */
    displayName?: string
  }
}

/**
 * Azure OpenAI agent configuration
 */
export interface AzureOpenAIAgentConfig extends AgentProviderConfig {
  type: 'azure-openai'
  authType: 'api-key'
  settings: AgentProviderConfig['settings'] & {
    endpoint: string
    apiKey: string
    deploymentName: string
    systemPrompt?: string
  }
}

/**
 * Agent provider event callbacks
 */
export interface AgentProviderCallbacks {
  onConnectionStateChanged?: (state: AgentConnectionState) => void
  onMessageReceived?: (message: AgentMessage) => void
  onConversationStarted?: (conversation: AgentConversation) => void
  onConversationEnded?: (conversationId: string) => void
  onTyping?: () => void
  onError?: (error: Error) => void
  onAuthStateChanged?: (state: ProviderAuthState) => void
}

/**
 * Agent provider interface
 */
export interface IAgentProvider extends IProvider<AgentProviderConfig> {
  readonly category: 'agent'
  readonly providerType: AgentProviderType
  
  /** Current connection state */
  readonly connectionState: AgentConnectionState
  
  /** Current conversation */
  readonly conversation: AgentConversation | null
  
  /** Authentication state (if applicable) */
  readonly authState: ProviderAuthState | null
  
  /** Set callbacks for events */
  setCallbacks(callbacks: AgentProviderCallbacks): void
  
  /** Authenticate with the agent service */
  authenticate(): Promise<ProviderAuthState>
  
  /** Check if currently authenticated */
  isAuthenticated(): boolean
  
  /** Start a new conversation */
  startConversation(): Promise<AgentResponse>
  
  /** Send a message to the agent */
  sendMessage(text: string): Promise<AgentResponse>
  
  /** Send a suggested action */
  sendAction(action: AgentSuggestedAction): Promise<AgentResponse>
  
  /** End the current conversation */
  endConversation(): Promise<void>
  
  /** Get conversation history */
  getHistory(): AgentMessage[]
  
  /** Clear conversation history */
  clearHistory(): void
}

/**
 * Agent provider factory configuration
 */
export interface AgentProviderFactoryConfig {
  type: AgentProviderType
  displayName: string
  description: string
  requiredSettings: (keyof AgentProviderConfig['settings'])[]
  supportsStreaming: boolean
  supportsSuggestedActions: boolean
  supportsAttachments: boolean
  requiresAuth: boolean
}
