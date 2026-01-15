// ============================================
// Teams Agent Bridge - TypeScript Types
// ============================================

// Re-export all provider types
export * from './providers'

// Re-export behavior pattern types
export * from './behavior'

// App Stage Types
export type AppStage = 'setup' | 'connect' | 'meeting' | 'summary'

export type ConnectionStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'in-lobby'
  | 'error'

export type MuteState = 'muted' | 'unmuted' | 'unknown'

export type SpeechState = 'idle' | 'synthesizing' | 'speaking' | 'error'

// Log Entry
export interface LogEntry {
  id: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
  timestamp: Date
}

// Configuration Types
export interface CopilotStudioConfig {
  appClientId?: string  // Legacy alias for clientId
  clientId: string
  tenantId: string
  environmentId: string
  agentIdentifier?: string  // Legacy alias for botId
  botId: string
  botName?: string
}

export interface SpeechConfig {
  key: string
  region: string
  endpoint?: string
  voiceName?: string
}

export interface OpenAIConfig {
  endpoint: string
  deployment: string
  apiKey: string
}

export interface AppConfig {
  endpoint: string
  accessKey: string
  agentName: string
  callUrl?: string
  copilotStudio: CopilotStudioConfig
  speech: SpeechConfig
  openai: OpenAIConfig
}

// ACS / Call Types
export interface Participant {
  id: string
  displayName: string
  isMuted: boolean
  isSpeaking: boolean
}

export interface Caption {
  id: string
  speaker: string
  text: string
  timestamp: Date
  isFinal: boolean
}

// Agent Types
export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresIn: number
  message: string
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'agent' | 'assistant'
  text?: string
  content?: string
  timestamp: Date
  suggestedActions?: string[]
}

export interface AgentSession {
  isActive: boolean
  speaker: string | null
  startedAt: Date | null
  inFollowUpWindow: boolean
}

// Call Analytics Types
export interface CallStats {
  duration: number
  participantCount: number
  captionCount: number
  questionCount: number
  responseCount: number
  avgResponseTime: number
}

export interface Question {
  id: string
  speaker: string
  text: string
  timestamp: Date
  responseTime: number | null
}

export interface TranscriptEntry {
  speaker: string
  text: string
  timestamp: Date
}

export interface CallAnalytics {
  stats: CallStats
  transcript: TranscriptEntry[]
  questions: Question[]
  participants: string[]
  aiSummary: string | null
  isGeneratingSummary: boolean
}

// Copilot Auth State
export interface CopilotAuthState {
  isAuthenticated: boolean
  isAuthenticating: boolean
  account: {
    username?: string
    name?: string
  } | null
  deviceCode: DeviceCodeInfo | null
  error: string | null
}

// Copilot Conversation State
export interface CopilotConversationState {
  isConnected: boolean
  isConnecting: boolean
  conversationId: string | null
  messages: ConversationMessage[]
  error: string | null
}

// ============================================
// Tab System Types
// ============================================

export type TabType = 'home' | 'meeting'

export interface BaseTab {
  id: string
  type: TabType
  title: string
  createdAt: Date
}

export interface HomeTab extends BaseTab {
  type: 'home'
}

export interface MeetingTab extends BaseTab {
  type: 'meeting'
  meetingUrl: string
  meetingTitle?: string
  joinedAt: Date
  isActive: boolean  // Is the call still active
  stage: AppStage    // Current stage for this meeting
  // Agent configuration for this meeting
  agentName: string           // Display name for the agent in this meeting
  activeProviderId: string | null  // Currently active agent provider
  // Conversation state for this meeting
  conversationId: string | null   // Copilot conversation ID for this tab
  conversationMessages: ConversationMessage[]  // Chat history for this tab
}

export type Tab = HomeTab | MeetingTab

export interface MeetingInfo {
  id: string
  title: string
  meetingUrl: string
  joinedAt: Date
  leftAt?: Date
  duration?: number
  participantCount?: number
  captionCount?: number
  // Persisted summary data (populated when meeting ends)
  summary?: MeetingSummaryData
}

// Data saved when a meeting ends for viewing in history
export interface MeetingSummaryData {
  transcript: TranscriptEntry[]
  questions: Question[]
  participants: string[]
  aiSummary: string | null
  stats: {
    totalDuration: number
    totalCaptions: number
    totalQuestions: number
    totalResponses: number
    averageResponseTime: number
  }
}

// ============================================
// Agent Provider System Types
// ============================================

export type AgentProviderType = 'copilot-studio' | 'copilot-studio-anon' | 'azure-foundry' | 'azure-openai' | 'custom'

export type AgentProviderAuthType = 'microsoft-device-code' | 'api-key' | 'default-credential' | 'oauth' | 'service-principal' | 'none'

export type AgentProviderStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'authenticating'

// Popular Azure Speech voices for agent TTS
export const AZURE_VOICES = [
  { value: 'en-US-JennyNeural', label: 'Jenny (Female, Conversational)' },
  { value: 'en-US-AriaNeural', label: 'Aria (Female, Expressive)' },
  { value: 'en-US-GuyNeural', label: 'Guy (Male, Conversational)' },
  { value: 'en-US-DavisNeural', label: 'Davis (Male, Expressive)' },
] as const

// Base configuration for all agent providers
export interface BaseAgentProviderConfig {
  id: string
  name: string
  type: AgentProviderType
  authType: AgentProviderAuthType
  isDefault?: boolean
  createdAt: Date
  // Voice configuration for TTS
  voiceName?: string
  // Pre/Post processing options
  preprocessing?: {
    enabled: boolean
    ttsOptimization?: boolean
    customRules?: string[]
  }
  postprocessing?: {
    enabled: boolean
    formatLinks?: boolean
    customRules?: string[]
  }
}

// Copilot Studio specific configuration (authenticated)
export interface CopilotStudioProviderConfig extends BaseAgentProviderConfig {
  type: 'copilot-studio'
  authType: 'microsoft-device-code'
  settings: {
    clientId: string
    tenantId: string
    environmentId: string
    botId: string
    botName?: string
  }
}

// Copilot Studio anonymous configuration (Direct Line)
export interface CopilotStudioAnonProviderConfig extends BaseAgentProviderConfig {
  type: 'copilot-studio-anon'
  authType: 'none'
  settings: {
    /** Direct Line secret from Copilot Studio (Settings > Security > Web channel security) */
    directLineSecret: string
    botName?: string
  }
}

// Azure Foundry configuration
export interface AzureFoundryProviderConfig extends BaseAgentProviderConfig {
  type: 'azure-foundry'
  authType: 'api-key' | 'service-principal'
  settings: {
    /** AI Project endpoint URL */
    projectEndpoint: string
    /** Agent ID from Foundry */
    agentName: string
    /** API key for authentication (when authType is 'api-key') */
    apiKey?: string
    /** Azure AD Tenant ID (when authType is 'service-principal') */
    tenantId?: string
    /** Service Principal Client ID (when authType is 'service-principal') */
    clientId?: string
    /** Service Principal Client Secret (when authType is 'service-principal') */
    clientSecret?: string
    /** Azure region */
    region: string
    /** Optional display name */
    displayName?: string
  }
}

// Azure OpenAI configuration (for future use)
export interface AzureOpenAIProviderConfig extends BaseAgentProviderConfig {
  type: 'azure-openai'
  authType: 'api-key'
  settings: {
    endpoint: string
    deployment: string
    apiKey: string
    systemPrompt?: string
  }
}

// Union type for all provider configs
export type AgentProviderConfig = CopilotStudioProviderConfig | CopilotStudioAnonProviderConfig | AzureFoundryProviderConfig | AzureOpenAIProviderConfig

// Runtime state for a provider instance
export interface AgentProviderInstance {
  config: AgentProviderConfig
  status: AgentProviderStatus
  error?: string
  // Auth state (for providers that need it)
  auth?: {
    isAuthenticated: boolean
    deviceCode?: DeviceCodeInfo
    accessToken?: string
    tokenExpiresAt?: Date
    account?: {
      username?: string
      name?: string
    }
  }
  // Conversation state
  conversation?: {
    id: string | null
    isConnected: boolean
  }
}

// ============================================
// User Preferences Types
// ============================================

export interface UserPreferences {
  // Display name used in meetings
  defaultAgentName: string
  // Default provider ID to use
  defaultProviderId?: string
  // TTS voice preference
  defaultVoice?: string
  // UI preferences
  ui?: {
    theme?: 'light' | 'dark' | 'system'
    logsExpanded?: boolean
    showAgentPanel?: boolean
  }
}

// ============================================
// Meeting-specific Agent State
// ============================================

export interface MeetingAgentState {
  // Display name for this meeting (can override default)
  agentName: string
  // Active provider for this meeting
  activeProviderId: string | null
  // Provider instances for this meeting
  providers: Record<string, AgentProviderInstance>
}
