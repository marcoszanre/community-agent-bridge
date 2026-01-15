// ============================================
// Speech Provider Hook
// React hook for using speech (TTS) providers
// ============================================

import { useCallback, useEffect, useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { useCallStore } from '@/stores/callStore'
import type { SpeechState } from '@/types'
import type {
  ISpeechProvider,
  SpeechProviderConfig,
  SpeechSynthesisState,
  SpeechSynthesisOptions,
  VoiceInfo
} from '@/types/providers'

/**
 * Map provider synthesis state to callStore speech state
 */
function mapToCallStoreSpeechState(state: SpeechSynthesisState): SpeechState {
  switch (state) {
    case 'idle': return 'idle'
    case 'synthesizing': return 'synthesizing'
    case 'speaking': return 'speaking'
    case 'paused': return 'idle' // Map paused to idle
    case 'error': return 'error'
    default: return 'idle'
  }
}

interface UseSpeechProviderOptions {
  instanceId?: string
  autoCreate?: boolean
  providerType?: string
  config?: SpeechProviderConfig
}

interface UseSpeechProviderReturn {
  // Provider state
  provider: ISpeechProvider | undefined
  isReady: boolean
  isSpeaking: boolean
  synthesisState: SpeechSynthesisState
  error: string | undefined
  
  // Voice data
  availableVoices: VoiceInfo[]
  currentVoice: VoiceInfo | null
  
  // Actions
  createProvider: (type: string, config: SpeechProviderConfig) => Promise<ISpeechProvider>
  speak: (text: string, options?: SpeechSynthesisOptions) => Promise<void>
  speakToCall: (text: string, options?: SpeechSynthesisOptions) => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  setVoice: (voiceName: string) => void
  loadVoices: () => Promise<VoiceInfo[]>
  preprocessText: (text: string) => Promise<string>
  dispose: () => Promise<void>
}

/**
 * Hook for using speech providers
 */
export function useSpeechProvider(
  options: UseSpeechProviderOptions = {}
): UseSpeechProviderReturn {
  const {
    instanceId = 'default-speech',
    autoCreate = false,
    providerType = 'azure-speech',
    config
  } = options

  const {
    createInstance,
    disposeInstance,
    getSpeechProvider,
    getMeetingProvider,
    setActiveProvider,
    instances
  } = useProviderStore()

  const callStore = useCallStore()

  const [localState, setLocalState] = useState<{
    synthesisState: SpeechSynthesisState
    availableVoices: VoiceInfo[]
    currentVoice: VoiceInfo | null
    error?: string
  }>({
    synthesisState: 'idle',
    availableVoices: [],
    currentVoice: null
  })

  // Get current provider
  const provider = getSpeechProvider(instanceId)
  const instanceInfo = instances[instanceId]

  // Auto-create provider if configured
  useEffect(() => {
    if (autoCreate && config && !provider) {
      createProvider(providerType, config).catch(console.error)
    }
  }, [autoCreate, config, provider])

  // Set up callbacks when provider is available
  useEffect(() => {
    if (!provider) return

    provider.setCallbacks({
      onStateChanged: (state) => {
        setLocalState(prev => ({ ...prev, synthesisState: state }))
        callStore.setSpeechState(mapToCallStoreSpeechState(state))
      },
      onSpeakingStarted: () => {
        callStore.setSpeechState('speaking', 'Speaking...')
      },
      onSpeakingCompleted: () => {
        callStore.setSpeechState('idle')
      },
      onError: (error) => {
        setLocalState(prev => ({ ...prev, error: error.message }))
        callStore.setSpeechState('error', error.message)
      }
    })

    // Sync initial state
    setLocalState(prev => ({
      ...prev,
      synthesisState: provider.synthesisState,
      availableVoices: provider.availableVoices,
      currentVoice: provider.currentVoice
    }))
  }, [provider])

  // Create a new provider instance
  const createProvider = useCallback(async (
    type: string,
    providerConfig: SpeechProviderConfig
  ): Promise<ISpeechProvider> => {
    const newProvider = await createInstance<ISpeechProvider>(
      instanceId,
      type,
      providerConfig
    )
    
    setActiveProvider('speech', instanceId)
    return newProvider
  }, [instanceId, createInstance, setActiveProvider])

  // Speak through local audio
  const speak = useCallback(async (
    text: string,
    options?: SpeechSynthesisOptions
  ): Promise<void> => {
    if (!provider) {
      throw new Error('No speech provider available. Create one first.')
    }
    
    // Preprocess text first
    const cleanedText = await provider.preprocessText(text)
    await provider.speak(cleanedText, options)
  }, [provider])

  // Speak through call audio (TTS injection)
  const speakToCall = useCallback(async (
    text: string,
    options?: SpeechSynthesisOptions
  ): Promise<void> => {
    if (!provider) {
      throw new Error('No speech provider available. Create one first.')
    }

    // Get meeting provider for audio context
    const meetingProvider = getMeetingProvider()
    const audioContext = meetingProvider?.getAudioContext()
    const destination = meetingProvider?.getAudioDestination()

    if (!audioContext || !destination) {
      // Fall back to local audio
      console.warn('No call audio context available, using local audio')
      await speak(text, options)
      return
    }

    // Preprocess text
    const cleanedText = await provider.preprocessText(text)
    
    // Speak to call audio context
    await provider.speakToAudioContext(cleanedText, audioContext, destination, options)
  }, [provider, getMeetingProvider, speak])

  // Stop playback
  const stop = useCallback((): void => {
    if (provider) {
      provider.stop()
    }
  }, [provider])

  // Pause playback
  const pause = useCallback((): void => {
    if (provider) {
      provider.pause()
    }
  }, [provider])

  // Resume playback
  const resume = useCallback((): void => {
    if (provider) {
      provider.resume()
    }
  }, [provider])

  // Set voice
  const setVoice = useCallback((voiceName: string): void => {
    if (provider) {
      provider.setVoice(voiceName)
      setLocalState(prev => ({
        ...prev,
        currentVoice: provider.currentVoice
      }))
    }
  }, [provider])

  // Load available voices
  const loadVoices = useCallback(async (): Promise<VoiceInfo[]> => {
    if (!provider) {
      return []
    }
    
    const voices = await provider.getVoices()
    setLocalState(prev => ({ ...prev, availableVoices: voices }))
    return voices
  }, [provider])

  // Preprocess text
  const preprocessText = useCallback(async (text: string): Promise<string> => {
    if (!provider) {
      return text
    }
    return provider.preprocessText(text)
  }, [provider])

  // Dispose provider
  const dispose = useCallback(async (): Promise<void> => {
    await disposeInstance(instanceId)
    setLocalState({
      synthesisState: 'idle',
      availableVoices: [],
      currentVoice: null
    })
  }, [instanceId, disposeInstance])

  return {
    provider,
    isReady: instanceInfo?.status === 'ready',
    isSpeaking: localState.synthesisState === 'speaking',
    synthesisState: localState.synthesisState,
    error: localState.error || instanceInfo?.error,
    availableVoices: localState.availableVoices,
    currentVoice: localState.currentVoice,
    createProvider,
    speak,
    speakToCall,
    stop,
    pause,
    resume,
    setVoice,
    loadVoices,
    preprocessText,
    dispose
  }
}
