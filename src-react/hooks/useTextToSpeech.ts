// useTextToSpeech - React hook for TTS functionality

import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useConfigStore } from '@/stores/configStore'
import { getTextToSpeechService, getAcsCallService, type SpeechState } from '@/services'

export function useTextToSpeech() {
  const ttsService = getTextToSpeechService()
  const acsService = getAcsCallService()
  const { addLog } = useAppStore()
  const { config } = useConfigStore()
  const isInitialized = useRef(false)
  const lastVoiceRef = useRef<string | undefined>(config.speech.voiceName)
  
  const [speechState, setSpeechState] = useState<SpeechState>('idle')
  const [speakingText, setSpeakingText] = useState<string | null>(null)

  // Initialize TTS service
  const initialize = useCallback(async (options?: { force?: boolean }) => {
    const desiredVoice = config.speech?.voiceName
    const shouldReinitialize = options?.force || !isInitialized.current || lastVoiceRef.current !== desiredVoice
    if (!shouldReinitialize) return true

    if (!config.speech?.key || !config.speech?.region) {
      addLog('Speech service not configured', 'warning')
      return false
    }

    try {
      addLog('Initializing TTS service...', 'info')

      // Set up callbacks
      ttsService.onStateChanged = (state, message) => {
        setSpeechState(state)
        if (message) {
          addLog(`TTS: ${message}`, state === 'error' ? 'error' : 'info')
        }
      }

      const success = await ttsService.initialize({
        speechKey: config.speech.key,
        speechRegion: config.speech.region,
        voiceName: config.speech.voiceName,
        openaiEndpoint: config.openai?.endpoint,
        openaiApiKey: config.openai?.apiKey,
        openaiDeployment: config.openai?.deployment
      })

      if (success) {
        isInitialized.current = true
        lastVoiceRef.current = desiredVoice
        addLog('TTS service initialized', 'success')
      }

      return success
    } catch (error) {
      addLog(`TTS init failed: ${error}`, 'error')
      return false
    }
  }, [config.speech, config.openai, addLog])

  // Speak text with call integration
  const speak = useCallback(async (text: string) => {
    if (!isInitialized.current) {
      addLog('TTS not initialized', 'error')
      return null
    }

    try {
      setSpeakingText(text)

      // Determine if we need to unmute for playback
      const isInCall = acsService.isInCall()
      const wasMuted = acsService.isMuted()

      const cleanedText = await ttsService.speakText(text, {
        unmuteDuringPlayback: isInCall && wasMuted,
        unmuteCallback: async () => {
          if (isInCall) {
            await acsService.toggleMute() // Unmute
          }
        },
        muteCallback: async () => {
          if (isInCall && wasMuted) {
            await acsService.toggleMute() // Re-mute
          }
        }
      })

      return cleanedText
    } catch (error) {
      addLog(`TTS failed: ${error}`, 'error')
      return null
    } finally {
      setSpeakingText(null)
    }
  }, [addLog])

  // Stop current playback
  const stop = useCallback(() => {
    ttsService.stop()
    setSpeakingText(null)
  }, [])

  // Set volume
  const setVolume = useCallback((volume: number) => {
    ttsService.setVolume(volume)
  }, [])

  // Set speech rate (0.5 = slow, 1.0 = normal, 1.5 = fast, 2.0 = very fast)
  const setSpeechRate = useCallback((rate: number) => {
    ttsService.speechRate = rate
    addLog(`Speech rate set to ${rate.toFixed(1)}x`, 'info')
  }, [addLog])

  // Get current speech rate
  const getSpeechRate = useCallback(() => {
    return ttsService.speechRate
  }, [])

  return {
    initialize,
    speak,
    stop,
    setVolume,
    setSpeechRate,
    getSpeechRate,
    speechState,
    speakingText,
    isSpeaking: speechState === 'speaking',
    isSynthesizing: speechState === 'synthesizing'
  }
}
