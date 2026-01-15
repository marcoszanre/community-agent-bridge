// ============================================
// Speech Providers - Main Export
// ============================================

export { 
  AzureSpeechProvider, 
  createAzureSpeechProvider,
  azureSpeechProviderRegistration 
} from './AzureSpeechProvider'

// Re-export types
export type { ISpeechProvider, SpeechProviderConfig } from '@/types/providers'
