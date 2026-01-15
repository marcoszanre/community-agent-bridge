// ============================================
// Base Provider Types
// Foundational interfaces for all provider types
// ============================================

/**
 * Provider categories supported by the system
 */
export type ProviderCategory = 
  | 'meeting'      // Meeting platforms (Teams, Zoom, etc.)
  | 'speech'       // Speech services (Azure Speech, etc.)
  | 'agent'        // AI Agents (Copilot Studio, Foundry, etc.)
  | 'processor'    // Pre/Post processors (Azure OpenAI, GPT, etc.)

/**
 * Provider lifecycle status
 */
export type ProviderStatus = 
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'error'
  | 'disposed'

/**
 * Authentication types supported by providers
 */
export type AuthType = 
  | 'none'
  | 'api-key'
  | 'oauth'
  | 'device-code'
  | 'managed-identity'
  | 'service-principal'

/**
 * Base provider configuration
 * All providers must have these common fields
 */
export interface BaseProviderConfig {
  /** Unique identifier for this provider instance */
  id: string
  /** Human-readable name */
  name: string
  /** Provider type identifier (e.g., 'azure-speech', 'copilot-studio') */
  type: string
  /** Category of the provider */
  category: ProviderCategory
  /** Authentication type required */
  authType: AuthType
  /** Whether this is the default provider for its category */
  isDefault?: boolean
  /** Timestamp when config was created */
  createdAt: Date
  /** Timestamp when config was last updated */
  updatedAt?: Date
  /** Provider-specific settings */
  settings: Record<string, unknown>
}

/**
 * Provider authentication state
 */
export interface ProviderAuthState {
  isAuthenticated: boolean
  isAuthenticating: boolean
  error?: string
  expiresAt?: Date
  account?: {
    id?: string
    username?: string
    displayName?: string
  }
  tokens?: {
    accessToken?: string
    refreshToken?: string
  }
  /** Device code flow specific */
  deviceCode?: {
    userCode: string
    verificationUri: string
    expiresIn: number
    message: string
  }
}

/**
 * Provider runtime state
 */
export interface ProviderRuntimeState<TConfig extends BaseProviderConfig = BaseProviderConfig> {
  config: TConfig
  status: ProviderStatus
  error?: string
  auth?: ProviderAuthState
  metadata?: Record<string, unknown>
}

/**
 * Base provider interface
 * All providers must implement these methods
 */
export interface IProvider<TConfig extends BaseProviderConfig = BaseProviderConfig> {
  /** Provider unique type identifier */
  readonly type: string
  /** Provider category */
  readonly category: ProviderCategory
  /** Current configuration */
  readonly config: TConfig
  /** Current status */
  readonly status: ProviderStatus
  
  /** Initialize the provider with configuration */
  initialize(config: TConfig): Promise<void>
  
  /** Authenticate if required */
  authenticate?(): Promise<ProviderAuthState>
  
  /** Connect/activate the provider */
  connect?(): Promise<void>
  
  /** Disconnect/deactivate the provider */
  disconnect?(): Promise<void>
  
  /** Clean up resources */
  dispose(): Promise<void>
  
  /** Get current runtime state */
  getState(): ProviderRuntimeState<TConfig>
  
  /** Subscribe to state changes */
  onStateChange(callback: (state: ProviderRuntimeState<TConfig>) => void): () => void
}

/**
 * Provider factory function type
 * Uses a more permissive config type to allow specific provider configs
 */
export type ProviderFactory<
  TProvider extends IProvider = IProvider,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TConfig = any
> = (config?: Partial<TConfig>) => TProvider

/**
 * Provider registration info for the registry
 */
export interface ProviderRegistration<
  TProvider extends IProvider = IProvider,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TConfig = any
> {
  type: string
  category: ProviderCategory
  displayName: string
  description?: string
  factory: ProviderFactory<TProvider, TConfig>
  defaultConfig?: Partial<TConfig>
  /** Capabilities this provider supports */
  capabilities?: string[]
  /** Required settings fields */
  requiredSettings?: string[]
}

/**
 * Event types for provider events
 */
export interface ProviderEvents {
  'status-changed': { status: ProviderStatus; previousStatus: ProviderStatus }
  'error': { error: Error; context?: string }
  'auth-changed': { auth: ProviderAuthState }
  'connected': void
  'disconnected': void
  'disposed': void
}

/**
 * Generic event emitter interface for providers
 */
export interface ProviderEventEmitter {
  on<K extends keyof ProviderEvents>(
    event: K,
    callback: (data: ProviderEvents[K]) => void
  ): () => void
  
  emit<K extends keyof ProviderEvents>(event: K, data: ProviderEvents[K]): void
  
  removeAllListeners(): void
}
