// ============================================
// Meeting Provider Types
// Interfaces for meeting platforms (Teams, Zoom, etc.)
// ============================================

import type { 
  BaseProviderConfig, 
  IProvider
} from './base'

/**
 * Meeting provider types
 */
export type MeetingProviderType = 
  | 'teams-acs'     // Teams via Azure Communication Services
  | 'teams-direct'  // Teams direct integration
  | 'zoom'          // Zoom meetings
  | 'webex'         // Cisco Webex
  | 'google-meet'   // Google Meet
  | 'custom'        // Custom meeting provider

/**
 * Call connection state
 */
export type CallConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'in-lobby'
  | 'on-hold'
  | 'disconnecting'
  | 'reconnecting'

/**
 * Audio/Video mute state
 */
export type MediaMuteState = 'muted' | 'unmuted' | 'unknown'

/**
 * Participant information
 */
export interface MeetingParticipant {
  id: string
  displayName: string
  isMuted: boolean
  isSpeaking: boolean
  isLocal: boolean
  isHandRaised?: boolean
  handRaisedOrder?: number
  role?: 'organizer' | 'presenter' | 'attendee'
  joinedAt?: Date
}

/**
 * Raise hand state for a participant
 */
export interface RaisedHandState {
  participantId: string
  displayName?: string
  order: number
  raisedAt: Date
}

/**
 * Chat message from meeting
 */
export interface MeetingChatMessage {
  id: string
  senderId: string
  senderDisplayName: string
  content: string
  timestamp: Date
  type: 'text' | 'html' | 'system'
  /** Whether this message mentions the local user */
  mentionsMe?: boolean
  /** List of mentioned user IDs */
  mentions?: string[]
  /** Thread ID for the message */
  threadId?: string
}

/**
 * Caption/transcription data
 */
export interface MeetingCaption {
  id: string
  speaker: string
  speakerId?: string
  text: string
  timestamp: Date
  isFinal: boolean
  language?: string
  confidence?: number
}

/**
 * Meeting information
 */
export interface MeetingInfo {
  id: string
  title?: string
  meetingUrl: string
  platform: MeetingProviderType
  joinedAt?: Date
  scheduledStart?: Date
  scheduledEnd?: Date
}

/**
 * Media stream configuration
 */
export interface MediaStreamConfig {
  /** Enable audio */
  audio: boolean
  /** Enable video */
  video: boolean
  /** Start with microphone muted */
  startMuted?: boolean
  /** Audio input device ID */
  audioDeviceId?: string
  /** Video input device ID */
  videoDeviceId?: string
  /** Custom audio stream for TTS injection */
  customAudioStream?: MediaStream
}

/**
 * Meeting provider configuration
 */
export interface MeetingProviderConfig extends BaseProviderConfig {
  category: 'meeting'
  settings: {
    /** API endpoint */
    endpoint?: string
    /** Access key or token */
    accessKey?: string
    /** Region for the service */
    region?: string
    /** Display name to use when joining */
    displayName?: string
    /** Additional provider-specific settings */
    [key: string]: unknown
  }
}

/**
 * Teams ACS specific configuration
 */
export interface TeamsAcsProviderConfig extends MeetingProviderConfig {
  type: 'teams-acs'
  authType: 'api-key'
  settings: MeetingProviderConfig['settings'] & {
    endpoint: string
    accessKey: string
    displayName: string
  }
}

/**
 * Meeting provider event callbacks
 */
export interface MeetingProviderCallbacks {
  onConnectionStateChanged?: (state: CallConnectionState) => void
  onMuteStateChanged?: (state: MediaMuteState) => void
  onParticipantAdded?: (participant: MeetingParticipant) => void
  onParticipantRemoved?: (participantId: string) => void
  onParticipantUpdated?: (participant: MeetingParticipant) => void
  onCaptionReceived?: (caption: MeetingCaption) => void
  onCallEnded?: (reason?: { code: number; subCode: number; message?: string }) => void
  onError?: (error: Error) => void
  
  // Chat callbacks
  /** Called when a chat message is received */
  onChatMessageReceived?: (message: MeetingChatMessage) => void
  /** Called when the local user is mentioned in chat */
  onMentioned?: (message: MeetingChatMessage) => void
  
  // Raise hand callbacks
  /** Called when any participant raises their hand */
  onHandRaised?: (state: RaisedHandState) => void
  /** Called when any participant lowers their hand */
  onHandLowered?: (participantId: string) => void
  /** Called when the local user's hand state changes */
  onLocalHandStateChanged?: (isRaised: boolean) => void
}

/**
 * Meeting provider interface
 */
export interface IMeetingProvider extends IProvider<MeetingProviderConfig> {
  readonly category: 'meeting'
  readonly providerType: MeetingProviderType
  
  /** Current call connection state */
  readonly connectionState: CallConnectionState
  
  /** Current mute state */
  readonly muteState: MediaMuteState
  
  /** Current participants */
  readonly participants: MeetingParticipant[]
  
  /** Current meeting info */
  readonly meetingInfo: MeetingInfo | null
  
  /** Whether local user has raised hand */
  readonly isHandRaised: boolean
  
  /** List of participants with raised hands, ordered by raise time */
  readonly raisedHands: RaisedHandState[]
  
  /** Set callbacks for events */
  setCallbacks(callbacks: MeetingProviderCallbacks): void
  
  /** Join a meeting */
  joinMeeting(meetingUrl: string, options?: MediaStreamConfig): Promise<void>
  
  /** Leave the current meeting */
  leaveMeeting(): Promise<void>
  
  /** Mute/unmute microphone */
  setMuted(muted: boolean): Promise<void>
  
  /** Toggle mute state */
  toggleMute(): Promise<void>
  
  /** Start captions/transcription */
  startCaptions(language?: string): Promise<void>
  
  /** Stop captions */
  stopCaptions(): Promise<void>
  
  /** Get audio context for TTS injection */
  getAudioContext(): AudioContext | null
  
  /** Get audio destination for TTS */
  getAudioDestination(): MediaStreamAudioDestinationNode | null
  
  /** Inject audio stream (for TTS) */
  injectAudio(audioBuffer: AudioBuffer): Promise<void>
  
  // ============================================
  // Chat Methods
  // ============================================
  
  /** Send a chat message to the meeting */
  sendChatMessage(message: string): Promise<void>
  
  /** Get chat history (messages received after joining) */
  getChatHistory(): MeetingChatMessage[]
  
  // ============================================
  // Raise Hand Methods
  // ============================================
  
  /** Raise hand for the local participant */
  raiseHand(): Promise<void>
  
  /** Lower hand for the local participant */
  lowerHand(): Promise<void>
  
  /** Lower hands for all participants (requires organizer/presenter role) */
  lowerAllHands(): Promise<void>
}

/**
 * Meeting provider factory configuration
 */
export interface MeetingProviderFactoryConfig {
  type: MeetingProviderType
  displayName: string
  description: string
  requiredSettings: (keyof MeetingProviderConfig['settings'])[]
  supportsVideo: boolean
  supportsCaptions: boolean
  supportsAudioInjection: boolean
}
