// ============================================
// Teams ACS Meeting Provider
// Meeting provider implementation using Azure Communication Services
// ============================================

import { 
  CallClient, 
  CallAgent, 
  Call,
  LocalAudioStream,
  LocalVideoStream,
  Features,
  RaisedHand
} from '@azure/communication-calling'
import { AzureCommunicationTokenCredential, CommunicationIdentifierKind } from '@azure/communication-common'
import { ChatClient, ChatThreadClient, ChatMessageReceivedEvent } from '@azure/communication-chat'

import { BaseProvider } from '../core/BaseProvider'
import type {
  TeamsAcsProviderConfig,
  IMeetingProvider,
  MeetingProviderType,
  CallConnectionState,
  MediaMuteState,
  MeetingParticipant,
  MeetingCaption,
  MeetingInfo,
  MeetingProviderCallbacks,
  MediaStreamConfig,
  ProviderRegistration,
  MeetingChatMessage,
  RaisedHandState
} from '@/types/providers'

// Internal types
type AcsCallState = 'None' | 'Connecting' | 'Ringing' | 'Connected' | 'LocalHold' | 'RemoteHold' | 'InLobby' | 'Disconnecting' | 'Disconnected'

interface CaptionData {
  speaker?: { displayName?: string }
  captionText?: string
  spokenText?: string
  resultType?: string
}

// Global audio context for TTS injection
declare global {
  interface Window {
    ttsAudioContext: AudioContext | null
    ttsGainNode: GainNode | null
    ttsDestination: MediaStreamAudioDestinationNode | null
    agentVideoPreviewCanvas?: HTMLCanvasElement
    agentVideoPreviewStream?: MediaStream
    setAgentSpeaking?: (speaking: boolean) => void
  }
}

/**
 * Map ACS call state to our connection state
 */
function mapCallState(acsState: AcsCallState): CallConnectionState {
  const stateMap: Record<AcsCallState, CallConnectionState> = {
    'None': 'disconnected',
    'Connecting': 'connecting',
    'Ringing': 'ringing',
    'Connected': 'connected',
    'LocalHold': 'on-hold',
    'RemoteHold': 'on-hold',
    'InLobby': 'in-lobby',
    'Disconnecting': 'disconnecting',
    'Disconnected': 'disconnected'
  }
  return stateMap[acsState] || 'disconnected'
}

/**
 * Teams ACS Meeting Provider
 */
export class TeamsAcsMeetingProvider 
  extends BaseProvider<TeamsAcsProviderConfig> 
  implements IMeetingProvider {
  
  readonly type = 'teams-acs'
  readonly category = 'meeting' as const
  readonly providerType: MeetingProviderType = 'teams-acs'

  private callClient: CallClient | null = null
  private callAgent: CallAgent | null = null
  private currentCall: Call | null = null
  private callbacks: MeetingProviderCallbacks = {}
  private onVideoCreatedUnsub: (() => void) | null = null
  
  private _connectionState: CallConnectionState = 'disconnected'
  private _muteState: MediaMuteState = 'unknown'
  private _participants: MeetingParticipant[] = []
  private _meetingInfo: MeetingInfo | null = null

  // Audio context for TTS injection
  private ttsAudioContext: AudioContext | null = null
  private ttsGainNode: GainNode | null = null
  private ttsDestination: MediaStreamAudioDestinationNode | null = null

  // Chat integration
  private chatClient: ChatClient | null = null
  private chatThreadClient: ChatThreadClient | null = null
  private _chatHistory: MeetingChatMessage[] = []
  private _localUserId: string = ''

  // Raise hand state
  private _isHandRaised: boolean = false
  private _raisedHands: RaisedHandState[] = []

  get connectionState(): CallConnectionState {
    return this._connectionState
  }

  get muteState(): MediaMuteState {
    return this._muteState
  }

  get participants(): MeetingParticipant[] {
    return [...this._participants]
  }

  get meetingInfo(): MeetingInfo | null {
    return this._meetingInfo
  }

  get isHandRaised(): boolean {
    return this._isHandRaised
  }

  get raisedHands(): RaisedHandState[] {
    return [...this._raisedHands]
  }

  /**
   * Initialize the provider
   */
  protected async onInitialize(config: TeamsAcsProviderConfig): Promise<void> {
    console.log('🎥 Initializing Teams ACS Meeting Provider...')
    
    // Validate required settings
    if (!config.settings.endpoint || !config.settings.accessKey) {
      throw new Error('ACS endpoint and access key are required')
    }

    // Wire video preview hook for UI consumers
    const service = (window as unknown as { acsCallService?: { onVideoStreamCreated?: ((stream: MediaStream) => void) | null } }).acsCallService
    if (service && typeof service.onVideoStreamCreated === 'function') {
      const handler = (stream: MediaStream) => {
        this.setMetadata('videoStream', stream)
        window.agentVideoPreviewStream = stream
      }
      service.onVideoStreamCreated = handler
      this.onVideoCreatedUnsub = () => { service.onVideoStreamCreated = null }
    }
  }

  /**
   * Set callbacks for events
   */
  setCallbacks(callbacks: MeetingProviderCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Join a Teams meeting
   */
  async joinMeeting(meetingUrl: string, _options?: MediaStreamConfig): Promise<void> {
    if (!this._config) {
      throw new Error('Provider not initialized')
    }

    try {
      this.setStatus('connecting')
      this.setConnectionState('connecting')

      // Fetch ACS token with both voip and chat scopes
      const { token, userId } = await this.fetchToken()
      this._localUserId = userId
      
      // Initialize call client and agent
      await this.initializeCallAgent(token, this._config.settings.displayName)
      
      // Initialize chat client for meeting chat integration
      await this.initializeChatClient(token)
      
      // Create media streams
      const audioMediaStream = this.createTtsAudioStream()
      const videoMediaStream = this.createVideoStream()
      
      // Resume audio context if needed
      if (this.ttsAudioContext?.state === 'suspended') {
        await this.ttsAudioContext.resume()
      }
      
      const localAudioStream = new LocalAudioStream(audioMediaStream)
      const localVideoStream = new LocalVideoStream(videoMediaStream)
      
      const callOptions = {
        audioOptions: {
          muted: true,
          localAudioStreams: [localAudioStream]
        },
        videoOptions: {
          localVideoStreams: [localVideoStream]
        }
      }
      
      // Join the meeting
      if (meetingUrl.includes('teams.microsoft.com')) {
        this.currentCall = this.callAgent!.join({ meetingLink: meetingUrl }, callOptions)
      } else {
        this.currentCall = this.callAgent!.startCall(
          [{ communicationUserId: meetingUrl }],
          callOptions
        )
      }
      
      // Store meeting info
      this._meetingInfo = {
        id: crypto.randomUUID(),
        meetingUrl,
        platform: 'teams-acs',
        joinedAt: new Date()
      }
      
      // Set up call handlers
      this.setupCallHandlers()
      
      console.log('🎥 Call object created, waiting for connection...')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join meeting'
      this.setError(message)
      this.setStatus('error')
      this.setConnectionState('disconnected')
      throw error
    }
  }

  /**
   * Leave the current meeting
   */
  async leaveMeeting(): Promise<void> {
    if (this.currentCall) {
      await this.currentCall.hangUp()
      console.log('🎥 Left meeting')
    }
  }

  /**
   * Set mute state
   */
  async setMuted(muted: boolean): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No active call')
    }
    
    if (muted) {
      await this.currentCall.mute()
    } else {
      await this.currentCall.unmute()
    }
  }

  /**
   * Toggle mute state
   */
  async toggleMute(): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No active call')
    }
    
    await this.setMuted(!this.currentCall.isMuted)
  }

  /**
   * Start captions
   */
  async startCaptions(language: string = 'en-us'): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No active call')
    }
    
    try {
      const captionsFeature = this.currentCall.feature(Features.Captions)
      const captions = captionsFeature.captions as unknown as {
        kind: string
        isCaptionsFeatureActive: boolean
        startCaptions: (options: { spokenLanguage: string }) => Promise<void>
        on: (event: string, callback: (data: CaptionData) => void) => void
      }
      
      if (captions.kind === 'TeamsCaptions') {
        // Subscribe to caption events
        captions.on('CaptionsReceived', (data: CaptionData) => {
          if (data.resultType === 'Final' && (data.captionText || data.spokenText)) {
            const caption: MeetingCaption = {
              id: crypto.randomUUID(),
              speaker: data.speaker?.displayName || 'Unknown',
              text: data.captionText || data.spokenText || '',
              timestamp: new Date(),
              isFinal: true
            }
            this.callbacks.onCaptionReceived?.(caption)
          }
        })
        
        if (!captions.isCaptionsFeatureActive) {
          await captions.startCaptions({ spokenLanguage: language })
          console.log('🎥 Captions started')
        }
      }
    } catch (error) {
      console.error('Failed to setup captions:', error)
      throw error
    }
  }

  /**
   * Stop captions
   */
  async stopCaptions(): Promise<void> {
    // ACS doesn't support stopping captions once started
    console.log('🎥 Captions cannot be stopped (ACS limitation)')
  }

  /**
   * Get audio context for TTS injection
   */
  getAudioContext(): AudioContext | null {
    return this.ttsAudioContext || window.ttsAudioContext
  }

  /**
   * Get audio destination for TTS
   */
  getAudioDestination(): MediaStreamAudioDestinationNode | null {
    return this.ttsDestination || window.ttsDestination
  }

  /**
   * Inject audio into the call
   */
  async injectAudio(audioBuffer: AudioBuffer): Promise<void> {
    const context = this.ttsAudioContext || window.ttsAudioContext
    const gainNode = this.ttsGainNode || window.ttsGainNode
    
    if (!context || !gainNode) {
      throw new Error('No audio context available for injection')
    }
    
    if (context.state === 'suspended') {
      await context.resume()
    }
    
    const source = context.createBufferSource()
    source.buffer = audioBuffer
    source.connect(gainNode)
    gainNode.gain.value = 1.0
    
    return new Promise((resolve) => {
      source.onended = () => {
        gainNode.gain.value = 0
        resolve()
      }
      source.start(0)
    })
  }

  // ============================================
  // Chat Methods
  // ============================================

  /**
   * Send a chat message to the meeting
   */
  async sendChatMessage(message: string): Promise<void> {
    if (!this.chatThreadClient) {
      throw new Error('Chat not connected - join a meeting first')
    }

    try {
      const sendMessageRequest = { content: message }
      const sendMessageOptions = { 
        senderDisplayName: this._config?.settings.displayName || 'Agent'
      }
      
      const result = await this.chatThreadClient.sendMessage(sendMessageRequest, sendMessageOptions)
      console.log(`💬 Message sent, id: ${result.id}`)
    } catch (error) {
      console.error('Failed to send chat message:', error)
      throw error
    }
  }

  /**
   * Get chat history (messages received after joining)
   */
  getChatHistory(): MeetingChatMessage[] {
    return [...this._chatHistory]
  }

  // ============================================
  // Raise Hand Methods
  // ============================================

  /**
   * Raise hand for the local participant
   */
  async raiseHand(): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No active call')
    }

    try {
      const raiseHandFeature = this.currentCall.feature(Features.RaiseHand)
      await raiseHandFeature.raiseHand()
      console.log('✋ Hand raised')
    } catch (error) {
      console.error('Failed to raise hand:', error)
      throw error
    }
  }

  /**
   * Lower hand for the local participant
   */
  async lowerHand(): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No active call')
    }

    try {
      const raiseHandFeature = this.currentCall.feature(Features.RaiseHand)
      await raiseHandFeature.lowerHand()
      console.log('✋ Hand lowered')
    } catch (error) {
      console.error('Failed to lower hand:', error)
      throw error
    }
  }

  /**
   * Lower hands for all participants (requires organizer/presenter role)
   */
  async lowerAllHands(): Promise<void> {
    if (!this.currentCall) {
      throw new Error('No active call')
    }

    try {
      const raiseHandFeature = this.currentCall.feature(Features.RaiseHand)
      await raiseHandFeature.lowerAllHands()
      console.log('✋ All hands lowered')
    } catch (error) {
      console.error('Failed to lower all hands:', error)
      throw error
    }
  }

  /**
   * Dispose the provider
   */
  protected async onDispose(): Promise<void> {
    // Stop chat notifications
    if (this.chatClient) {
      try {
        this.chatClient.stopRealtimeNotifications()
      } catch (e) {
        console.warn('Error stopping chat notifications:', e)
      }
    }

    if (this.currentCall) {
      try {
        await this.currentCall.hangUp()
      } catch (e) {
        console.warn('Error hanging up call:', e)
      }
    }
    
    if (this.callAgent) {
      await this.callAgent.dispose()
    }
    
    if (this.ttsAudioContext) {
      await this.ttsAudioContext.close()
    }

    if (this.onVideoCreatedUnsub) {
      this.onVideoCreatedUnsub()
      this.onVideoCreatedUnsub = null
    }

    this.cleanup()
  }

  // Private methods

  /**
   * Fetch ACS token with both voip and chat scopes
   */
  private async fetchToken(): Promise<{ token: string; userId: string }> {
    const { CommunicationIdentityClient } = await import('@azure/communication-identity')
    
    const identityClient = new CommunicationIdentityClient(
      `endpoint=${this._config.settings.endpoint};accesskey=${this._config.settings.accessKey}`
    )
    
    const user = await identityClient.createUser()
    // Request both voip and chat scopes for full meeting functionality
    const tokenResponse = await identityClient.getToken(user, ['voip', 'chat'])
    
    this._localUserId = user.communicationUserId
    
    return { 
      token: tokenResponse.token, 
      userId: user.communicationUserId 
    }
  }

  /**
   * Initialize call agent
   */
  private async initializeCallAgent(token: string, displayName: string): Promise<void> {
    this.callClient = new CallClient()
    const tokenCredential = new AzureCommunicationTokenCredential(token)
    
    this.callAgent = await this.callClient.createCallAgent(tokenCredential, { displayName })
    
    // Set up call agent event handlers
    this.callAgent.on('incomingCall', async (e) => {
      console.log('🎥 Incoming call received')
      const incomingCall = e.incomingCall
      this.currentCall = await incomingCall.accept()
      this.setupCallHandlers()
    })
  }

  /**
   * Initialize chat client for meeting chat integration
   */
  private async initializeChatClient(token: string): Promise<void> {
    if (!this._config?.settings.endpoint) {
      throw new Error('ACS endpoint is required for chat')
    }

    const endpointUrl = this._config.settings.endpoint
    const tokenCredential = new AzureCommunicationTokenCredential(token)
    
    this.chatClient = new ChatClient(endpointUrl, tokenCredential)
    console.log('💬 Chat client initialized')
  }

  /**
   * Create TTS audio stream for speech injection
   */
  private createTtsAudioStream(): MediaStream {
    const context = new AudioContext()
    const dest = context.createMediaStreamDestination()
    
    const gainNode = context.createGain()
    gainNode.gain.value = 0 // Start silent
    gainNode.connect(dest)
    
    // Store references
    this.ttsAudioContext = context
    this.ttsGainNode = gainNode
    this.ttsDestination = dest
    
    // Also set global references for backward compatibility
    window.ttsAudioContext = context
    window.ttsGainNode = gainNode
    window.ttsDestination = dest
    
    return dest.stream
  }

  /**
   * Create video stream - Perplexity-style particle sphere visualization
   */
  private createVideoStream(): MediaStream {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = 1280
    canvas.height = 720
    
    // Particle system for sphere
    interface Particle {
      baseX: number
      baseY: number
      baseZ: number
    }
    const particles: Particle[] = []
    const particleCount = 1000
    const sphereRadius = Math.min(canvas.width, canvas.height) * 0.28
    
    // Create particles distributed on sphere surface using fibonacci sphere algorithm
    for (let i = 0; i < particleCount; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / particleCount)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      
      const x = sphereRadius * Math.sin(phi) * Math.cos(theta)
      const y = sphereRadius * Math.sin(phi) * Math.sin(theta)
      const z = sphereRadius * Math.cos(phi)
      
      particles.push({ baseX: x, baseY: y, baseZ: z })
    }
    
    let time = 0
    let isSpeaking = false
    let speakingIntensity = 0
    
    // Expose method to set speaking state globally
    window.setAgentSpeaking = (speaking: boolean) => {
      isSpeaking = speaking
    }
    
    const intervalId = setInterval(() => {
      time += 0.012
      
      // Smoothly transition speaking intensity
      const targetIntensity = isSpeaking ? 1 : 0
      speakingIntensity += (targetIntensity - speakingIntensity) * 0.08
      
      // Background gradient - warm amber/brown, shifts to vibrant orange when speaking
      const bgHue = 30 + speakingIntensity * 25
      const bgSat = 45 + speakingIntensity * 35
      const bgLight1 = 8 + speakingIntensity * 8
      const bgLight2 = 18 + speakingIntensity * 12
      
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
      )
      gradient.addColorStop(0, `hsl(${bgHue}, ${bgSat}%, ${bgLight2}%)`)
      gradient.addColorStop(0.6, `hsl(${bgHue - 5}, ${bgSat - 10}%, ${bgLight1 + 5}%)`)
      gradient.addColorStop(1, `hsl(${bgHue - 10}, ${bgSat - 15}%, ${bgLight1}%)`)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Rotation speeds - faster and more dynamic when speaking
      const rotationSpeedY = 0.25 + speakingIntensity * 0.6
      const rotationSpeedX = 0.12 + speakingIntensity * 0.35
      const rotationSpeedZ = 0.08 + speakingIntensity * 0.2
      
      const angleY = time * rotationSpeedY
      const angleX = time * rotationSpeedX
      const angleZ = time * rotationSpeedZ
      
      // Project and transform particles
      const projectedParticles = particles.map((p, i) => {
        // Add wave distortion when speaking - creates pulsing effect
        const waveFreq = 2.5 + speakingIntensity * 2
        const waveAmp = speakingIntensity * 25
        const wave = waveAmp * Math.sin(time * waveFreq + i * 0.02)
        const radialPulse = 1 + speakingIntensity * 0.15 * Math.sin(time * 4 + i * 0.01)
        
        let x = p.baseX * radialPulse
        let y = p.baseY * radialPulse
        let z = p.baseZ * radialPulse + wave
        
        // Rotate around Z axis
        const cosZ = Math.cos(angleZ)
        const sinZ = Math.sin(angleZ)
        const x0 = x * cosZ - y * sinZ
        const y0 = x * sinZ + y * cosZ
        
        // Rotate around Y axis
        const cosY = Math.cos(angleY)
        const sinY = Math.sin(angleY)
        const x1 = x0 * cosY - z * sinY
        const z1 = x0 * sinY + z * cosY
        
        // Rotate around X axis
        const cosX = Math.cos(angleX)
        const sinX = Math.sin(angleX)
        const y1 = y0 * cosX - z1 * sinX
        const z2 = y0 * sinX + z1 * cosX
        
        return { x: x1, y: y1, z: z2, index: i }
      }).sort((a, b) => a.z - b.z)
      
      // Draw particles
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      
      projectedParticles.forEach(p => {
        const depthScale = (p.z + sphereRadius * 1.5) / (sphereRadius * 3)
        const alpha = Math.max(0.15, Math.min(0.95, 0.2 + depthScale * 0.75))
        const size = Math.max(0.5, 1 + depthScale * 2.5)
        
        // Particle color - warm golden, brighter when speaking
        const particleHue = 38 + speakingIntensity * 12
        const particleSat = 55 + speakingIntensity * 30 + depthScale * 20
        const particleLight = 50 + depthScale * 40 + speakingIntensity * 10
        
        ctx.beginPath()
        ctx.arc(centerX + p.x, centerY + p.y, size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${particleHue}, ${particleSat}%, ${particleLight}%, ${alpha})`
        ctx.fill()
      })
    }, 1000 / 30)
    
    const stream = canvas.captureStream(30)
    // Store references for UI preview
    this.setMetadata('videoIntervalId', intervalId)
    this.setMetadata('videoCanvas', canvas)
    this.setMetadata('videoStream', stream)
    window.agentVideoPreviewCanvas = canvas
    window.agentVideoPreviewStream = stream
    return stream
  }

  /**
   * Set up call event handlers
   */
  private setupCallHandlers(): void {
    if (!this.currentCall) return
    
    // Mute state changes
    this.currentCall.on('isMutedChanged', () => {
      const muted = this.currentCall!.isMuted
      this._muteState = muted ? 'muted' : 'unmuted'
      this.callbacks.onMuteStateChanged?.(this._muteState)
    })
    
    // Call state changes
    this.currentCall.on('stateChanged', async () => {
      const state = this.currentCall!.state as AcsCallState
      const connectionState = mapCallState(state)
      this.setConnectionState(connectionState)
      
      if (state === 'Connected') {
        this.setStatus('connected')
        await this.startCaptions()
        // Initialize chat thread when connected
        await this.setupChatThread()
        // Set up raise hand handlers
        this.setupRaiseHandHandlers()
      } else if (state === 'Disconnected') {
        this.setStatus('ready')
        const reason = this.currentCall!.callEndReason as { code: number; subCode: number } | undefined
        this.callbacks.onCallEnded?.(reason)
        this.cleanup()
      }
    })
    
    // Remote participants
    this.currentCall.on('remoteParticipantsUpdated', (e) => {
      e.added.forEach((participant) => {
        const p: MeetingParticipant = {
          id: (participant as unknown as { identifier: { communicationUserId: string } }).identifier?.communicationUserId || crypto.randomUUID(),
          displayName: participant.displayName || 'Unknown',
          isMuted: participant.isMuted,
          isSpeaking: false,
          isLocal: false,
          isHandRaised: false
        }
        this._participants.push(p)
        this.callbacks.onParticipantAdded?.(p)
      })
      
      e.removed.forEach((participant) => {
        const id = (participant as unknown as { identifier: { communicationUserId: string } }).identifier?.communicationUserId
        if (id) {
          this._participants = this._participants.filter(p => p.id !== id)
          this.callbacks.onParticipantRemoved?.(id)
        }
      })
    })
  }

  /**
   * Set up chat thread and subscribe to messages
   */
  private async setupChatThread(): Promise<void> {
    if (!this.chatClient || !this.currentCall) return

    try {
      // Get the chat thread ID from the call info (Teams provides this)
      const callInfo = this.currentCall.info as { threadId?: string } | undefined
      const threadId = callInfo?.threadId

      if (!threadId) {
        console.warn('💬 No chat thread ID available for this meeting')
        return
      }

      // Get the chat thread client
      this.chatThreadClient = this.chatClient.getChatThreadClient(threadId)
      console.log(`💬 Chat thread connected: ${threadId}`)

      // Start real-time notifications
      await this.chatClient.startRealtimeNotifications()

      // Subscribe to chat message events
      this.chatClient.on('chatMessageReceived', (event: ChatMessageReceivedEvent) => {
        // Only process messages for our thread
        if (threadId !== event.threadId) return

        // Extract sender ID - handle both ACS and Teams users
        const senderIdentifier = event.sender as CommunicationIdentifierKind
        let senderId = ''
        if ('communicationUserId' in senderIdentifier) {
          senderId = senderIdentifier.communicationUserId
        } else if ('microsoftTeamsUserId' in senderIdentifier) {
          senderId = senderIdentifier.microsoftTeamsUserId
        }
        const isFromSelf = senderId === this._localUserId

        // Check if this message mentions the local user
        const mentionsMe = this.checkMentionsMe(event.message)

        const chatMessage: MeetingChatMessage = {
          id: event.id,
          senderId,
          senderDisplayName: event.senderDisplayName || 'Unknown',
          content: event.message,
          timestamp: event.createdOn,
          type: event.type === 'html' ? 'html' : 'text',
          mentionsMe,
          threadId: event.threadId
        }

        // Add to chat history
        this._chatHistory.push(chatMessage)

        // Don't notify for our own messages
        if (!isFromSelf) {
          this.callbacks.onChatMessageReceived?.(chatMessage)

          // If mentioned, trigger the mention callback
          if (mentionsMe) {
            console.log('💬 You were mentioned in chat!')
            this.callbacks.onMentioned?.(chatMessage)
          }
        }
      })

      console.log('💬 Chat notifications started')
    } catch (error) {
      console.error('Failed to setup chat thread:', error)
      // Don't throw - chat is optional, call can continue without it
    }
  }

  /**
   * Check if a message mentions the local user
   */
  private checkMentionsMe(message: string): boolean {
    if (!this._localUserId || !message) return false
    
    // Check for direct user ID mention
    if (message.includes(this._localUserId)) return true
    
    // Check for @mention patterns (common in Teams)
    // Teams typically uses <at id="...">DisplayName</at> format
    const displayName = this._config?.settings.displayName || ''
    if (displayName && message.toLowerCase().includes(`@${displayName.toLowerCase()}`)) {
      return true
    }
    
    // Check for <at> tag mentions
    const atMentionRegex = /<at[^>]*>([^<]*)<\/at>/gi
    const matches = message.match(atMentionRegex)
    if (matches) {
      for (const match of matches) {
        if (match.includes(this._localUserId) || 
            (displayName && match.toLowerCase().includes(displayName.toLowerCase()))) {
          return true
        }
      }
    }
    
    return false
  }

  /**
   * Set up raise hand event handlers
   */
  private setupRaiseHandHandlers(): void {
    if (!this.currentCall) return

    try {
      const raiseHandFeature = this.currentCall.feature(Features.RaiseHand)

      // Helper to extract participant ID from identifier
      const getParticipantId = (identifier: CommunicationIdentifierKind): string => {
        if ('communicationUserId' in identifier) {
          return identifier.communicationUserId
        } else if ('microsoftTeamsUserId' in identifier) {
          return identifier.microsoftTeamsUserId
        }
        return ''
      }

      // Get initial raised hands state
      const initialRaisedHands = raiseHandFeature.getRaisedHands()
      this._raisedHands = initialRaisedHands.map((rh: RaisedHand) => {
        const participantId = getParticipantId(rh.identifier as CommunicationIdentifierKind)
        return {
          participantId,
          displayName: this.getParticipantDisplayName(participantId),
          order: rh.order,
          raisedAt: new Date()
        }
      })

      // Check if local user has hand raised
      this._isHandRaised = this._raisedHands.some(
        rh => rh.participantId === this._localUserId
      )

      // Subscribe to hand raised events
      raiseHandFeature.on('raisedHandEvent', (event) => {
        const participantId = getParticipantId(event.identifier as CommunicationIdentifierKind)
        const displayName = this.getParticipantDisplayName(participantId)
        
        // Get order from existing raised hands list (order comes from getRaisedHands, not the event)
        const existingRaisedHands = raiseHandFeature.getRaisedHands()
        const raisedHandInfo = existingRaisedHands.find(
          (rh) => getParticipantId(rh.identifier as CommunicationIdentifierKind) === participantId
        )
        const order = raisedHandInfo?.order ?? this._raisedHands.length + 1
        
        const raisedHandState: RaisedHandState = {
          participantId,
          displayName,
          order,
          raisedAt: new Date()
        }

        // Add to raised hands list
        this._raisedHands.push(raisedHandState)
        this._raisedHands.sort((a, b) => a.order - b.order)

        // Update participant
        const participant = this._participants.find(p => p.id === participantId)
        if (participant) {
          participant.isHandRaised = true
          participant.handRaisedOrder = raisedHandState.order
          this.callbacks.onParticipantUpdated?.(participant)
        }

        // Check if this is the local user
        if (participantId === this._localUserId) {
          this._isHandRaised = true
          this.callbacks.onLocalHandStateChanged?.(true)
        }

        console.log(`✋ ${displayName || participantId} raised hand (order: ${raisedHandState.order})`)
        this.callbacks.onHandRaised?.(raisedHandState)
      })

      // Subscribe to hand lowered events
      raiseHandFeature.on('loweredHandEvent', (event) => {
        const participantId = getParticipantId(event.identifier as CommunicationIdentifierKind)
        
        // Remove from raised hands list
        this._raisedHands = this._raisedHands.filter(
          rh => rh.participantId !== participantId
        )

        // Update participant
        const participant = this._participants.find(p => p.id === participantId)
        if (participant) {
          participant.isHandRaised = false
          participant.handRaisedOrder = undefined
          this.callbacks.onParticipantUpdated?.(participant)
        }

        // Check if this is the local user
        if (participantId === this._localUserId) {
          this._isHandRaised = false
          this.callbacks.onLocalHandStateChanged?.(false)
        }

        console.log(`✋ ${participantId} lowered hand`)
        this.callbacks.onHandLowered?.(participantId)
      })

      console.log('✋ Raise hand handlers configured')
    } catch (error) {
      console.error('Failed to setup raise hand handlers:', error)
      // Don't throw - raise hand is optional
    }
  }

  /**
   * Get participant display name by ID
   */
  private getParticipantDisplayName(participantId: string): string | undefined {
    // Check local participants list
    const participant = this._participants.find(p => p.id === participantId)
    if (participant?.displayName) return participant.displayName

    // Check remote participants from call
    if (this.currentCall) {
      const remoteParticipant = this.currentCall.remoteParticipants.find(
        p => (p as unknown as { identifier: { communicationUserId: string } }).identifier?.communicationUserId === participantId
      )
      if (remoteParticipant?.displayName) return remoteParticipant.displayName
    }

    // Return local user's display name if it matches
    if (participantId === this._localUserId) {
      return this._config?.settings.displayName
    }

    return undefined
  }

  /**
   * Set connection state
   */
  private setConnectionState(state: CallConnectionState): void {
    if (this._connectionState !== state) {
      this._connectionState = state
      this.callbacks.onConnectionStateChanged?.(state)
      this.notifyStateChange()
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.currentCall = null
    this._participants = []
    this._meetingInfo = null
    this._connectionState = 'disconnected'
    this._muteState = 'unknown'
    
    // Reset chat state
    this.chatThreadClient = null
    this._chatHistory = []
    
    // Reset raise hand state
    this._isHandRaised = false
    this._raisedHands = []
    
    // Clear video interval
    const intervalId = this._metadata['videoIntervalId'] as number | undefined
    if (intervalId) {
      clearInterval(intervalId)
    }
    
    // Clean up global audio context references
    window.ttsAudioContext = null
    window.ttsGainNode = null
    window.ttsDestination = null
  }
}

/**
 * Factory function for creating Teams ACS provider
 */
export function createTeamsAcsMeetingProvider(
  _config?: Partial<TeamsAcsProviderConfig>
): TeamsAcsMeetingProvider {
  return new TeamsAcsMeetingProvider()
}

/**
 * Provider registration
 */
export const teamsAcsMeetingProviderRegistration: ProviderRegistration<
  TeamsAcsMeetingProvider,
  TeamsAcsProviderConfig
> = {
  type: 'teams-acs',
  category: 'meeting',
  displayName: 'Teams (via ACS)',
  description: 'Join Microsoft Teams meetings using Azure Communication Services',
  factory: createTeamsAcsMeetingProvider,
  capabilities: ['join-teams', 'captions', 'tts-injection', 'video', 'chat', 'raise-hand'],
  requiredSettings: ['endpoint', 'accessKey', 'displayName'],
  defaultConfig: {
    type: 'teams-acs',
    category: 'meeting',
    authType: 'api-key'
  }
}
