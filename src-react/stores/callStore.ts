import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { MuteState, SpeechState, Caption, Participant, CallStats, ConnectionStatus } from '@/types'

interface CallState {
  // Call info
  isInCall: boolean
  callStartTime: Date | null
  meetingUrl: string
  connectionStatus: ConnectionStatus
  welcomeMessageSent: boolean
  setMeetingUrl: (url: string) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setWelcomeMessageSent: (sent: boolean) => void
  
  // Mute state
  muteState: MuteState
  isMuted: boolean
  setMuteState: (state: MuteState) => void
  setIsMuted: (muted: boolean) => void
  
  // Speech/TTS state
  speechState: SpeechState
  speechProgress: string
  setSpeechState: (state: SpeechState, progress?: string) => void
  
  // Participants
  participants: Participant[]
  addParticipant: (participant: Participant) => void
  removeParticipant: (id: string) => void
  updateParticipant: (id: string, updates: Partial<Participant>) => void
  
  // Captions
  captions: Caption[]
  addCaption: (caption: Caption) => void
  clearCaptions: () => void
  
  // Call lifecycle
  startCall: () => void
  endCall: () => void
  resetCallState: () => void
  
  // Stats (calculated)
  getStats: () => CallStats
}

export const useCallStore = create<CallState>()(
  devtools(
    (set, get) => ({
      // Initial state
      isInCall: false,
      callStartTime: null,
      meetingUrl: '',
      connectionStatus: 'disconnected' as ConnectionStatus,
      welcomeMessageSent: false,
      muteState: 'unknown',
      isMuted: false,
      speechState: 'idle',
      speechProgress: '',
      participants: [],
      captions: [],

      // Actions
      setMeetingUrl: (meetingUrl) => set({ meetingUrl }, false, 'setMeetingUrl'),
      
      setConnectionStatus: (connectionStatus) => set({ connectionStatus }, false, 'setConnectionStatus'),
      
      setWelcomeMessageSent: (welcomeMessageSent) => set({ welcomeMessageSent }, false, 'setWelcomeMessageSent'),
      
      setMuteState: (muteState) => set({ muteState }, false, 'setMuteState'),
      
      setIsMuted: (isMuted) => set({ 
        isMuted, 
        muteState: isMuted ? 'muted' : 'unmuted' 
      }, false, 'setIsMuted'),
      
      setSpeechState: (speechState, speechProgress = '') =>
        set({ speechState, speechProgress }, false, 'setSpeechState'),
      
      addParticipant: (participant) =>
        set(
          (state) => ({
            participants: [...state.participants, participant],
          }),
          false,
          'addParticipant'
        ),
      
      removeParticipant: (id) =>
        set(
          (state) => ({
            participants: state.participants.filter((p) => p.id !== id),
          }),
          false,
          'removeParticipant'
        ),
      
      updateParticipant: (id, updates) =>
        set(
          (state) => ({
            participants: state.participants.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          }),
          false,
          'updateParticipant'
        ),
      
      addCaption: (caption) =>
        set(
          (state) => ({
            captions: [...state.captions, caption].slice(-500), // Keep last 500
          }),
          false,
          'addCaption'
        ),
      
      clearCaptions: () => set({ captions: [] }, false, 'clearCaptions'),
      
      startCall: () =>
        set(
          {
            isInCall: true,
            callStartTime: new Date(),
            captions: [],
            participants: [],
            muteState: 'unmuted',
            welcomeMessageSent: false,
          },
          false,
          'startCall'
        ),
      
      endCall: () =>
        set(
          {
            isInCall: false,
            muteState: 'unknown',
            isMuted: false,
            speechState: 'idle',
            speechProgress: '',
            connectionStatus: 'disconnected' as ConnectionStatus,
          },
          false,
          'endCall'
        ),
      
      resetCallState: () =>
        set(
          {
            isInCall: false,
            callStartTime: null,
            meetingUrl: '',
            connectionStatus: 'disconnected' as ConnectionStatus,
            welcomeMessageSent: false,
            muteState: 'unknown',
            isMuted: false,
            speechState: 'idle',
            speechProgress: '',
            participants: [],
            captions: [],
          },
          false,
          'resetCallState'
        ),
      
      getStats: () => {
        const state = get()
        const duration = state.callStartTime
          ? Math.floor((Date.now() - state.callStartTime.getTime()) / 1000)
          : 0
        
        return {
          duration,
          participantCount: state.participants.length,
          captionCount: state.captions.filter((c) => c.isFinal).length,
          questionCount: 0, // Will be updated from agent store
          responseCount: 0, // Will be updated from agent store
          avgResponseTime: 0, // Will be updated from agent store
        }
      },
    }),
    { name: 'call-store' }
  )
)
