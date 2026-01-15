// useAcsCall - React hook for Azure Communication Services calls

import { useCallback, useRef } from 'react'
import { useCallStore } from '@/stores/callStore'
import { useAppStore } from '@/stores/appStore'
import { getAcsCallService, getCallAnalyticsService } from '@/services'
import { clearTokenCache } from '@/services/tokenService'

export function useAcsCall() {
  const acsService = getAcsCallService()
  const analyticsService = getCallAnalyticsService()
  const wasConnected = useRef(false)  // Track if call ever connected
  
  const {
    setIsMuted,
    addCaption,
    addParticipant,
    removeParticipant,
    setConnectionStatus: setCallStoreStatus,
    resetCallState
  } = useCallStore()
  
  const { addLog, setCurrentStage, setConnectionStatus } = useAppStore()

  // Helper to update both stores
  const updateConnectionStatus = useCallback((status: 'disconnected' | 'connecting' | 'connected' | 'in-lobby' | 'error') => {
    setCallStoreStatus(status)
    setConnectionStatus(status)
  }, [setCallStoreStatus, setConnectionStatus])

  // Initialize ACS client
  const initialize = useCallback(async (token: string, agentDisplayName: string): Promise<{ success: boolean; error?: string }> => {
    // Always reset if already initialized to guarantee new CallAgent display name
    const currentAgent = acsService.isInitializedForAgent
    console.log(`🔍 ACS Initialize called: requested="${agentDisplayName}", current="${currentAgent}"`)

    if (currentAgent !== null) {
      const reason = currentAgent === agentDisplayName ? 'same agent (force refresh)' : 'different agent'
      console.log(`🔄 ACS already initialized (${reason}); resetting before init`)
      addLog(`Resetting ACS client before initializing as "${agentDisplayName}" (was "${currentAgent}")...`, 'info')
      await acsService.reset()
      wasConnected.current = false
      console.log(`🔄 ACS reset complete, proceeding with initialization`)
    }

    try {
      console.log(`🚀 Initializing ACS client as "${agentDisplayName}"...`)
      addLog(`Initializing ACS client as "${agentDisplayName}"...`, 'info')
      
      // Set up callbacks before initializing
      acsService.onStateChanged = (state) => {
        addLog(`Call state: ${state}`, 'info')
        
        if (state === 'Connected') {
          wasConnected.current = true
          updateConnectionStatus('connected')
          setCurrentStage('meeting')
          analyticsService.startCall()
        } else if (state === 'Connecting' || state === 'Ringing') {
          updateConnectionStatus('connecting')
        } else if (state === 'InLobby') {
          updateConnectionStatus('in-lobby')
        } else if (state === 'Disconnected') {
          // Only update status, don't navigate - let onCallEnded handle navigation
          updateConnectionStatus('disconnected')
        }
      }

      acsService.onMuteChanged = (muted) => {
        addLog(`Mute: ${muted ? 'muted' : 'unmuted'}`, 'info')
        setIsMuted(muted)
      }

      acsService.onCaptionReceived = (caption) => {
        addCaption(caption)
        analyticsService.trackCaption(caption)
      }

      acsService.onParticipantAdded = (participant) => {
        addLog(`Participant joined: ${participant.displayName}`, 'info')
        addParticipant(participant)
      }

      acsService.onParticipantRemoved = (id) => {
        addLog(`Participant left`, 'info')
        removeParticipant(id)
      }

      acsService.onCallEnded = (reason) => {
        if (reason) {
          addLog(`Call ended: code ${reason.code}, subcode ${reason.subCode}`, 'info')
        } else {
          addLog('Call ended', 'info')
        }
        analyticsService.endCall()
        // Only go to summary if we actually had a call that connected
        if (wasConnected.current) {
          wasConnected.current = false
          setCurrentStage('summary')
        } else {
          // Call failed to connect or ended from lobby - update status to trigger UI change
          addLog('Call ended before connecting', 'warning')
          updateConnectionStatus('disconnected')
        }
      }

      await acsService.initialize(token, agentDisplayName)
      addLog('ACS client initialized', 'success')
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ACS init error'
      addLog(`ACS init failed: ${message}`, 'error')
      return { success: false, error: message }
    }
  }, [addLog, updateConnectionStatus, setCurrentStage, setIsMuted, addCaption, addParticipant, removeParticipant, acsService, analyticsService])

  // Explicitly reset so future calls can initialize with a new display name/token.
  const resetInitialization = useCallback(async () => {
    addLog('🔄 Resetting ACS initialization...', 'info')
    clearTokenCache() // force new ACS identity so display name cannot stick across agents
    await acsService.reset()
    wasConnected.current = false
  }, [acsService, addLog])

  // Join a Teams meeting
  const joinMeeting = useCallback(async (meetingUrl: string) => {
    try {
      addLog('Joining Teams meeting...', 'info')
      updateConnectionStatus('connecting')
      await acsService.joinMeeting(meetingUrl)
      return true
    } catch (error) {
      addLog(`Join failed: ${error}`, 'error')
      updateConnectionStatus('error')
      return false
    }
  }, [addLog, updateConnectionStatus])

  // Toggle mute
  const toggleMute = useCallback(async () => {
    try {
      const newMuteState = await acsService.toggleMute()
      return newMuteState
    } catch (error) {
      addLog(`Mute toggle failed: ${error}`, 'error')
      throw error
    }
  }, [addLog])

  // Leave call
  const leaveCall = useCallback(async () => {
    try {
      addLog('Leaving call...', 'info')
      await acsService.leaveCall()
      resetCallState()
      return true
    } catch (error) {
      addLog(`Leave failed: ${error}`, 'error')
      return false
    }
  }, [addLog, resetCallState])

  // Send a reaction in the call
  const sendReaction = useCallback(async (reactionType: 'like' | 'heart' | 'applause' | 'laugh' | 'surprised' = 'like') => {
    try {
      const success = await acsService.sendReaction(reactionType)
      if (success) {
        addLog(`👍 Sent ${reactionType} reaction`, 'info')
      }
      return success
    } catch (error) {
      addLog(`Reaction failed: ${error}`, 'error')
      return false
    }
  }, [addLog])

  // Send thumbs up reaction - convenience method
  const sendThumbsUp = useCallback(async () => {
    return sendReaction('like')
  }, [sendReaction])

  // Raise hand
  const raiseHand = useCallback(async () => {
    try {
      const success = await acsService.raiseHand()
      if (success) {
        addLog('✋ Hand raised', 'info')
      }
      return success
    } catch (error) {
      addLog(`Raise hand failed: ${error}`, 'error')
      return false
    }
  }, [addLog])

  // Lower hand
  const lowerHand = useCallback(async () => {
    try {
      const success = await acsService.lowerHand()
      if (success) {
        addLog('✋ Hand lowered', 'info')
      }
      return success
    } catch (error) {
      addLog(`Lower hand failed: ${error}`, 'error')
      return false
    }
  }, [addLog])

  // Set callback for when hand is lowered (by host or self)
  const onHandLowered = useCallback((callback: () => void) => {
    acsService.onHandLowered = callback
  }, [])

  // Get chat thread ID for meeting chat interop
  const getChatThreadId = useCallback(() => {
    return acsService.getThreadId()
  }, [])

  // Set callback for when chat thread becomes available
  const onChatThreadReady = useCallback((callback: (threadId: string) => void) => {
    acsService.onChatThreadReady = callback
  }, [])

  // NOTE: We do NOT cleanup on unmount because:
  // 1. AcsCallService is a singleton shared across components
  // 2. ConnectStage unmounts when navigating to MeetingStage
  // 3. Disposing here would hang up the call we just connected
  // The service will be cleaned up when the call ends naturally

  return {
    initialize,
    resetInitialization,
    joinMeeting,
    toggleMute,
    leaveCall,
    sendReaction,
    sendThumbsUp,
    raiseHand,
    lowerHand,
    onHandLowered,
    getChatThreadId,
    onChatThreadReady,
    isInCall: acsService.isInCall.bind(acsService),
    isMuted: acsService.isMuted.bind(acsService),
    isHandRaised: acsService.isHandRaised.bind(acsService),
    getState: acsService.getState.bind(acsService)
  }
}
