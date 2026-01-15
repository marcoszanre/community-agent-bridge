// ============================================
// Base Provider Implementation
// Abstract base class for all providers
// ============================================

import type {
  BaseProviderConfig,
  IProvider,
  ProviderCategory,
  ProviderStatus,
  ProviderRuntimeState,
  ProviderAuthState,
  ProviderEventEmitter,
  ProviderEvents
} from '@/types/providers'

/**
 * Simple event emitter implementation for providers
 */
class SimpleEventEmitter implements ProviderEventEmitter {
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map()

  on<K extends keyof ProviderEvents>(
    event: K,
    callback: (data: ProviderEvents[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as (data: unknown) => void)
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as (data: unknown) => void)
    }
  }

  emit<K extends keyof ProviderEvents>(event: K, data: ProviderEvents[K]): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data))
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}

/**
 * Abstract base provider class
 * Provides common functionality for all provider implementations
 */
export abstract class BaseProvider<TConfig extends BaseProviderConfig = BaseProviderConfig> 
  implements IProvider<TConfig> {
  
  protected _config!: TConfig
  protected _status: ProviderStatus = 'uninitialized'
  protected _error?: string
  protected _auth?: ProviderAuthState
  protected _metadata: Record<string, unknown> = {}
  protected events: ProviderEventEmitter = new SimpleEventEmitter()
  protected stateSubscribers: Set<(state: ProviderRuntimeState<TConfig>) => void> = new Set()

  abstract readonly type: string
  abstract readonly category: ProviderCategory

  get config(): TConfig {
    return this._config
  }

  get status(): ProviderStatus {
    return this._status
  }

  /**
   * Initialize the provider with configuration
   */
  async initialize(config: TConfig): Promise<void> {
    this.setStatus('initializing')
    
    try {
      this._config = config
      await this.onInitialize(config)
      this.setStatus('ready')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.setError(errorMessage)
      this.setStatus('error')
      throw error
    }
  }

  /**
   * Hook for subclasses to implement initialization logic
   */
  protected abstract onInitialize(config: TConfig): Promise<void>

  /**
   * Optional authentication - override in subclasses that need auth
   */
  async authenticate(): Promise<ProviderAuthState> {
    // Default implementation - no auth needed
    const authState: ProviderAuthState = {
      isAuthenticated: true,
      isAuthenticating: false
    }
    this.setAuthState(authState)
    return authState
  }

  /**
   * Optional connect - override in subclasses that need connection
   */
  async connect(): Promise<void> {
    // Default implementation - no-op
  }

  /**
   * Optional disconnect - override in subclasses
   */
  async disconnect(): Promise<void> {
    // Default implementation - no-op
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    try {
      await this.onDispose()
      this.setStatus('disposed')
      this.events.emit('disposed', undefined as unknown as void)
      this.events.removeAllListeners()
      this.stateSubscribers.clear()
    } catch (error) {
      console.error(`Error disposing provider ${this.type}:`, error)
    }
  }

  /**
   * Hook for subclasses to implement cleanup logic
   */
  protected abstract onDispose(): Promise<void>

  /**
   * Get current runtime state
   */
  getState(): ProviderRuntimeState<TConfig> {
    return {
      config: this._config,
      status: this._status,
      error: this._error,
      auth: this._auth,
      metadata: this._metadata
    }
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: ProviderRuntimeState<TConfig>) => void): () => void {
    this.stateSubscribers.add(callback)
    return () => {
      this.stateSubscribers.delete(callback)
    }
  }

  /**
   * Set provider status and notify subscribers
   */
  protected setStatus(status: ProviderStatus): void {
    const previousStatus = this._status
    this._status = status
    
    if (previousStatus !== status) {
      this.events.emit('status-changed', { status, previousStatus })
      this.notifyStateChange()
    }
  }

  /**
   * Set error state
   */
  protected setError(error: string | undefined): void {
    this._error = error
    if (error) {
      this.events.emit('error', { error: new Error(error) })
    }
    this.notifyStateChange()
  }

  /**
   * Set auth state and notify subscribers
   */
  protected setAuthState(auth: ProviderAuthState): void {
    this._auth = auth
    this.events.emit('auth-changed', { auth })
    this.notifyStateChange()
  }

  /**
   * Update metadata
   */
  protected setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value
    this.notifyStateChange()
  }

  /**
   * Notify all state subscribers
   */
  protected notifyStateChange(): void {
    const state = this.getState()
    this.stateSubscribers.forEach(callback => {
      try {
        callback(state)
      } catch (error) {
        console.error('Error in state subscriber:', error)
      }
    })
  }

  /**
   * Subscribe to provider events
   */
  on<K extends keyof ProviderEvents>(
    event: K,
    callback: (data: ProviderEvents[K]) => void
  ): () => void {
    return this.events.on(event, callback)
  }
}
