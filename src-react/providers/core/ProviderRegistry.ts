// ============================================
// Provider Registry
// Central registry for all provider types
// ============================================

import type {
  IProvider,
  ProviderCategory,
  ProviderRegistration,
  ProviderFactory,
  BaseProviderConfig
} from '@/types/providers'

/**
 * Provider Registry - Singleton for managing all provider registrations
 */
class ProviderRegistryClass {
  private registrations: Map<string, ProviderRegistration> = new Map()
  private instances: Map<string, IProvider> = new Map()
  private categoryMap: Map<ProviderCategory, Set<string>> = new Map()

  constructor() {
    // Initialize category sets
    const categories: ProviderCategory[] = ['meeting', 'speech', 'agent', 'processor']
    categories.forEach(cat => this.categoryMap.set(cat, new Set()))
  }

  /**
   * Register a provider type
   */
  register<TProvider extends IProvider>(
    registration: ProviderRegistration<TProvider>
  ): void {
    const { type, category } = registration
    
    if (this.registrations.has(type)) {
      console.warn(`Provider type '${type}' is already registered. Overwriting.`)
    }
    
    this.registrations.set(type, registration as ProviderRegistration)
    this.categoryMap.get(category)?.add(type)
    
    console.log(`📦 Registered provider: ${type} (${category})`)
  }

  /**
   * Unregister a provider type
   */
  unregister(type: string): void {
    const registration = this.registrations.get(type)
    if (registration) {
      this.categoryMap.get(registration.category)?.delete(type)
      this.registrations.delete(type)
      console.log(`📦 Unregistered provider: ${type}`)
    }
  }

  /**
   * Get a provider registration by type
   */
  getRegistration(type: string): ProviderRegistration | undefined {
    return this.registrations.get(type)
  }

  /**
   * Get all registered provider types for a category
   */
  getProvidersByCategory(category: ProviderCategory): ProviderRegistration[] {
    const types = this.categoryMap.get(category) || new Set()
    return Array.from(types)
      .map(type => this.registrations.get(type))
      .filter((reg): reg is ProviderRegistration => reg !== undefined)
  }

  /**
   * Get all registered provider types
   */
  getAllProviders(): ProviderRegistration[] {
    return Array.from(this.registrations.values())
  }

  /**
   * Check if a provider type is registered
   */
  isRegistered(type: string): boolean {
    return this.registrations.has(type)
  }

  /**
   * Create a provider instance
   */
  createInstance<TProvider extends IProvider = IProvider>(
    type: string,
    config?: Partial<BaseProviderConfig>
  ): TProvider {
    const registration = this.registrations.get(type)
    
    if (!registration) {
      throw new Error(`Provider type '${type}' is not registered`)
    }
    
    const mergedConfig = {
      ...registration.defaultConfig,
      ...config
    }
    
    return registration.factory(mergedConfig) as TProvider
  }

  /**
   * Create and store a named provider instance
   */
  async createNamedInstance<TProvider extends IProvider = IProvider>(
    instanceId: string,
    type: string,
    config: BaseProviderConfig
  ): Promise<TProvider> {
    // Dispose existing instance if any
    await this.disposeInstance(instanceId)
    
    const instance = this.createInstance<TProvider>(type, config)
    await instance.initialize(config)
    
    this.instances.set(instanceId, instance)
    console.log(`📦 Created provider instance: ${instanceId} (${type})`)
    
    return instance
  }

  /**
   * Get a stored provider instance
   */
  getInstance<TProvider extends IProvider = IProvider>(
    instanceId: string
  ): TProvider | undefined {
    return this.instances.get(instanceId) as TProvider | undefined
  }

  /**
   * Get all stored instances for a category
   */
  getInstancesByCategory(category: ProviderCategory): IProvider[] {
    return Array.from(this.instances.values())
      .filter(instance => instance.category === category)
  }

  /**
   * Dispose a stored instance
   */
  async disposeInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (instance) {
      await instance.dispose()
      this.instances.delete(instanceId)
      console.log(`📦 Disposed provider instance: ${instanceId}`)
    }
  }

  /**
   * Dispose all stored instances
   */
  async disposeAll(): Promise<void> {
    const disposePromises = Array.from(this.instances.entries()).map(
      async ([id, instance]) => {
        try {
          await instance.dispose()
          console.log(`📦 Disposed provider instance: ${id}`)
        } catch (error) {
          console.error(`Error disposing provider ${id}:`, error)
        }
      }
    )
    
    await Promise.all(disposePromises)
    this.instances.clear()
  }

  /**
   * Get the factory function for a provider type
   */
  getFactory<TProvider extends IProvider = IProvider>(
    type: string
  ): ProviderFactory<TProvider> | undefined {
    const registration = this.registrations.get(type)
    return registration?.factory as ProviderFactory<TProvider> | undefined
  }

  /**
   * List all instance IDs
   */
  listInstances(): string[] {
    return Array.from(this.instances.keys())
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(type: string): string[] {
    return this.registrations.get(type)?.capabilities || []
  }

  /**
   * Find providers with specific capability
   */
  findByCapability(capability: string): ProviderRegistration[] {
    return Array.from(this.registrations.values())
      .filter(reg => reg.capabilities?.includes(capability))
  }
}

// Export singleton instance
export const ProviderRegistry = new ProviderRegistryClass()

// Export class for testing
export { ProviderRegistryClass }
