// ============================================
// Meeting Provider Hook
// React hook for using meeting providers
// ============================================

import { useCallback, useEffect, useState } from 'react'
import { useProviderStore } from '@/stores/providerStore'
import { useCallStore } from '@/stores/callStore'
import type {
  IMeetingProvider,
  MeetingProviderConfig,
  CallConnectionState,
  MediaMuteState,
  MeetingParticipant
} from '@/types/providers'

interface UseMeetingProviderOptions {
  instanceId?: string
  autoCreate?: boolean
  providerType?: string
  config?: MeetingProviderConfig
}

interface UseMeetingProviderReturn {
  // Provider state
  provider: IMeetingProvider | undefined
  isReady: boolean
  isConnecting: boolean
  isConnected: boolean
  connectionState: CallConnectionState
  muteState: MediaMuteState
  error: string | undefined
  
  // Meeting data
  participants: MeetingParticipant[]
  
  // Actions
  createProvider: (type: string, config: MeetingProviderConfig) => Promise<IMeetingProvider>
  joinMeeting: (meetingUrl: string) => Promise<void>
  leaveMeeting: () => Promise<void>
  toggleMute: () => Promise<void>
  setMuted: (muted: boolean) => Promise<void>
  dispose: () => Promise<void>
}

/**
 * Hook for using meeting providers
 */
export function useMeetingProvider(
  options: UseMeetingProviderOptions = {}
): UseMeetingProviderReturn {
  const {
    instanceId = 'default-meeting',
    autoCreate = false,
    providerType = 'teams-acs',
    config
  } = options

  const {
    createInstance,
    disposeInstance,
    getMeetingProvider,
    setActiveProvider,
    instances
  } = useProviderStore()

  const callStore = useCallStore()

  const [localState, setLocalState] = useState<{
    connectionState: CallConnectionState
    muteState: MediaMuteState
    participants: MeetingParticipant[]
    error?: string
  }>({
    connectionState: 'disconnected',
    muteState: 'unknown',
    participants: []
  })

  // Get current provider
  const provider = getMeetingProvider(instanceId)
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
      onConnectionStateChanged: (state) => {
        setLocalState(prev => ({ ...prev, connectionState: state }))
        
        // Update call store
        if (state === 'connected') {
          callStore.startCall()
          callStore.setConnectionStatus('connected')
        } else if (state === 'disconnected') {
          callStore.endCall()
          callStore.setConnectionStatus('disconnected')
        } else if (state === 'in-lobby') {
          callStore.setConnectionStatus('in-lobby')
        } else if (state === 'connecting') {
          callStore.setConnectionStatus('connecting')
        }
      },
      onMuteStateChanged: (state) => {
        setLocalState(prev => ({ ...prev, muteState: state }))
        callStore.setMuteState(state === 'muted' ? 'muted' : 'unmuted')
      },
      onParticipantAdded: (participant) => {
        setLocalState(prev => ({
          ...prev,
          participants: [...prev.participants, participant]
        }))
        callStore.addParticipant({
          id: participant.id,
          displayName: participant.displayName,
          isMuted: participant.isMuted,
          isSpeaking: participant.isSpeaking
        })
      },
      onParticipantRemoved: (participantId) => {
        setLocalState(prev => ({
          ...prev,
          participants: prev.participants.filter(p => p.id !== participantId)
        }))
        callStore.removeParticipant(participantId)
      },
      onCaptionReceived: (caption) => {
        callStore.addCaption({
          id: caption.id,
          speaker: caption.speaker,
          text: caption.text,
          timestamp: caption.timestamp,
          isFinal: caption.isFinal
        })
      },
      onCallEnded: () => {
        setLocalState(prev => ({
          ...prev,
          connectionState: 'disconnected',
          participants: []
        }))
        callStore.endCall()
      },
      onError: (error) => {
        setLocalState(prev => ({ ...prev, error: error.message }))
      }
    })
  }, [provider])

  // Create a new provider instance
  const createProvider = useCallback(async (
    type: string,
    providerConfig: MeetingProviderConfig
  ): Promise<IMeetingProvider> => {
    const newProvider = await createInstance<IMeetingProvider>(
      instanceId,
      type,
      providerConfig
    )
    
    setActiveProvider('meeting', instanceId)
    return newProvider
  }, [instanceId, createInstance, setActiveProvider])

  // Join a meeting
  const joinMeeting = useCallback(async (meetingUrl: string): Promise<void> => {
    if (!provider) {
      throw new Error('No meeting provider available. Create one first.')
    }
    
    callStore.setMeetingUrl(meetingUrl)
    await provider.joinMeeting(meetingUrl)
  }, [provider, callStore])

  // Leave meeting
  const leaveMeeting = useCallback(async (): Promise<void> => {
    if (!provider) return
    await provider.leaveMeeting()
  }, [provider])

  // Toggle mute
  const toggleMute = useCallback(async (): Promise<void> => {
    if (!provider) return
    await provider.toggleMute()
  }, [provider])

  // Set muted state
  const setMuted = useCallback(async (muted: boolean): Promise<void> => {
    if (!provider) return
    await provider.setMuted(muted)
  }, [provider])

  // Dispose provider
  const dispose = useCallback(async (): Promise<void> => {
    await disposeInstance(instanceId)
  }, [instanceId, disposeInstance])

  return {
    provider,
    isReady: instanceInfo?.status === 'ready' || instanceInfo?.status === 'connected',
    isConnecting: localState.connectionState === 'connecting',
    isConnected: localState.connectionState === 'connected',
    connectionState: localState.connectionState,
    muteState: localState.muteState,
    error: localState.error || instanceInfo?.error,
    participants: localState.participants,
    createProvider,
    joinMeeting,
    leaveMeeting,
    toggleMute,
    setMuted,
    dispose
  }
}
