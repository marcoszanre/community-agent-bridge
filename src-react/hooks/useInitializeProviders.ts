// ============================================
// Provider Initialization Hook
// Initialize all providers when the app starts
// ============================================

import { useEffect, useState, useCallback } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { useConfigStore } from '@/stores/configStore'
import type {
  TeamsAcsProviderConfig,
  AzureSpeechProviderConfig,
  CopilotStudioAgentConfig,
  AzureOpenAIProcessorConfig
} from '@/types/providers'

interface UseInitializeProvidersReturn {
  isInitialized: boolean
  isInitializing: boolean
  error: string | null
  initializeFromConfig: () => Promise<void>
  reinitialize: () => Promise<void>
}

/**
 * Hook to initialize providers from configuration
 */
export function useInitializeProviders(): UseInitializeProvidersReturn {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { config } = useConfigStore()
  const { createInstance, setActiveProvider, disposeAllInstances } = useProviderStore()

  // Initialize providers from config
  const initializeFromConfig = useCallback(async () => {
    if (isInitializing) return
    
    setIsInitializing(true)
    setError(null)

    try {
      // Dynamically import and register providers to avoid blocking render
      const { ensureProvidersRegistered } = await import('@/providers')
      ensureProvidersRegistered()
      console.log('📦 Providers registered, initializing from config...')

      // Initialize Meeting Provider (Teams ACS)
      if (config.endpoint && config.accessKey) {
        const meetingConfig: TeamsAcsProviderConfig = {
          id: 'meeting-teams-acs',
          name: 'Teams Meeting (ACS)',
          type: 'teams-acs',
          category: 'meeting',
          authType: 'api-key',
          createdAt: new Date(),
          settings: {
            endpoint: config.endpoint,
            accessKey: config.accessKey,
            displayName: config.agentName || 'AI Agent'
          }
        }
        
        await createInstance('meeting-teams-acs', 'teams-acs', meetingConfig)
        setActiveProvider('meeting', 'meeting-teams-acs')
        console.log('✅ Meeting provider initialized')
      }

      // Initialize Speech Provider (Azure Speech)
      if (config.speech.key && config.speech.region) {
        const speechConfig: AzureSpeechProviderConfig = {
          id: 'speech-azure',
          name: 'Azure Speech',
          type: 'azure-speech',
          category: 'speech',
          authType: 'api-key',
          createdAt: new Date(),
          settings: {
            apiKey: config.speech.key,
            region: config.speech.region,
            defaultVoice: config.speech.voiceName || 'en-US-JennyNeural'
          }
        }
        
        await createInstance('speech-azure', 'azure-speech', speechConfig)
        setActiveProvider('speech', 'speech-azure')
        console.log('✅ Speech provider initialized')
      }

      // Initialize Agent Provider (Copilot Studio)
      if (config.copilotStudio.clientId && config.copilotStudio.tenantId && 
          config.copilotStudio.environmentId && config.copilotStudio.botId) {
        const agentConfig: CopilotStudioAgentConfig = {
          id: 'agent-copilot-studio',
          name: config.copilotStudio.botName || 'Copilot Studio Agent',
          type: 'copilot-studio',
          category: 'agent',
          authType: 'device-code',
          createdAt: new Date(),
          settings: {
            clientId: config.copilotStudio.clientId,
            tenantId: config.copilotStudio.tenantId,
            environmentId: config.copilotStudio.environmentId,
            botId: config.copilotStudio.botId,
            botName: config.copilotStudio.botName
          }
        }
        
        await createInstance('agent-copilot-studio', 'copilot-studio', agentConfig)
        setActiveProvider('agent', 'agent-copilot-studio')
        console.log('✅ Agent provider initialized')
      }

      // Initialize Processor Provider (Azure OpenAI) for intent detection & TTS preprocessing
      if (config.openai.endpoint && config.openai.apiKey && config.openai.deployment) {
        const processorConfig: AzureOpenAIProcessorConfig = {
          id: 'processor-azure-openai',
          name: 'Azure OpenAI Processor',
          type: 'azure-openai',
          category: 'processor',
          authType: 'api-key',
          createdAt: new Date(),
          settings: {
            endpoint: config.openai.endpoint,
            apiKey: config.openai.apiKey,
            deploymentName: config.openai.deployment,
            temperature: 0.3,
            maxTokens: 1000
          }
        }
        
        await createInstance('processor-azure-openai', 'azure-openai-processor', processorConfig)
        setActiveProvider('preprocessor', 'processor-azure-openai')
        setActiveProvider('postprocessor', 'processor-azure-openai')
        console.log('✅ Processor provider initialized')
      } else {
        // Initialize rules-based processor as fallback
        await createInstance('processor-rules', 'rules-based', {
          id: 'processor-rules',
          name: 'Rules-Based Processor',
          type: 'rules-based',
          category: 'processor',
          authType: 'none',
          createdAt: new Date(),
          settings: {
            rules: []
          }
        })
        setActiveProvider('preprocessor', 'processor-rules')
        setActiveProvider('postprocessor', 'processor-rules')
        console.log('✅ Rules-based processor initialized (fallback)')
      }

      setIsInitialized(true)
      console.log('🎉 All providers initialized successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize providers'
      console.error('❌ Provider initialization error:', message)
      setError(message)
    } finally {
      setIsInitializing(false)
    }
  }, [config, createInstance, setActiveProvider, isInitializing])

  // Reinitialize providers
  const reinitialize = useCallback(async () => {
    await disposeAllInstances()
    await initializeFromConfig()
  }, [disposeAllInstances, initializeFromConfig])

  // Auto-initialize on mount
  useEffect(() => {
    if (!isInitialized && !isInitializing) {
      initializeFromConfig()
    }
  }, [])

  return {
    isInitialized,
    isInitializing,
    error,
    initializeFromConfig,
    reinitialize
  }
}
