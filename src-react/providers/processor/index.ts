// ============================================
// Processor Providers - Main Export
// ============================================

export { 
  AzureOpenAIProcessorProvider, 
  createAzureOpenAIProcessorProvider,
  azureOpenAIProcessorProviderRegistration 
} from './AzureOpenAIProcessorProvider'

export {
  RulesBasedProcessorProvider,
  createRulesBasedProcessorProvider,
  rulesBasedProcessorProviderRegistration,
  defaultRules
} from './RulesBasedProcessorProvider'

// Re-export types
export type { IProcessorProvider, ProcessorProviderConfig } from '@/types/providers'
