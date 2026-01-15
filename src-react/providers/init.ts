// ============================================
// Provider Initialization
// Register all built-in providers
// ============================================

import { ProviderRegistry } from './core/ProviderRegistry'

// Meeting providers
import { teamsAcsMeetingProviderRegistration } from './meeting'

// Speech providers
import { azureSpeechProviderRegistration } from './speech'

// Agent providers
import { copilotStudioAgentProviderRegistration } from './agent'

// Processor providers
import { azureOpenAIProcessorProviderRegistration, rulesBasedProcessorProviderRegistration } from './processor'

/**
 * Register all built-in providers
 */
export function registerAllProviders(): void {
  console.log('📦 Registering all providers...')

  // Meeting providers
  ProviderRegistry.register(teamsAcsMeetingProviderRegistration)

  // Speech providers
  ProviderRegistry.register(azureSpeechProviderRegistration)

  // Agent providers
  ProviderRegistry.register(copilotStudioAgentProviderRegistration)

  // Processor providers
  ProviderRegistry.register(azureOpenAIProcessorProviderRegistration)
  ProviderRegistry.register(rulesBasedProcessorProviderRegistration)

  console.log('📦 All providers registered')
  console.log('📦 Available providers:', ProviderRegistry.getAllProviders().map(p => p.type))
}

/**
 * Initialize providers with configuration from environment
 */
export async function initializeProviders(): Promise<void> {
  // First register all providers
  registerAllProviders()

  // Log available providers by category
  const categories = ['meeting', 'speech', 'agent', 'processor'] as const
  
  for (const category of categories) {
    const providers = ProviderRegistry.getProvidersByCategory(category)
    console.log(`📦 ${category} providers:`, providers.map(p => p.displayName))
  }
}

// Auto-register when module is imported
let isRegistered = false

export function ensureProvidersRegistered(): void {
  if (!isRegistered) {
    registerAllProviders()
    isRegistered = true
  }
}
