// ACS Call Service
// Manages Azure Communication Services calls with Teams meetings

import { 
  CallClient, 
  CallAgent, 
  Call,
  LocalAudioStream,
  LocalVideoStream,
  Features,
  ReactionMessage,
  Reaction
} from '@azure/communication-calling'
import { AzureCommunicationTokenCredential } from '@azure/communication-common'
import type { Caption, Participant } from '@/types'

// Types
type CallState = 'None' | 'Connecting' | 'Ringing' | 'Connected' | 'LocalHold' | 'RemoteHold' | 'InLobby' | 'Disconnecting' | 'Disconnected'
type ReactionType = Reaction

interface CallEndReason {
  code: number
  subCode: number
}

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
 * ACS Call Service - Manages Teams meeting connections
 */
export class AcsCallService {
  private callClient: CallClient | null = null
  private callAgent: CallAgent | null = null
  private currentCall: Call | null = null
  private _teamsCaptions: unknown = null
  private callStateCheckInterval: ReturnType<typeof setInterval> | null = null
  private lastKnownState: CallState = 'None'
  
  // Callbacks
  public onStateChanged: ((state: CallState) => void) | null = null
  public onMuteChanged: ((muted: boolean) => void) | null = null
  public onCaptionReceived: ((caption: Caption) => void) | null = null
  public onParticipantAdded: ((participant: Participant) => void) | null = null
  public onParticipantRemoved: ((id: string) => void) | null = null
  public onCallEnded: ((reason: CallEndReason | null) => void) | null = null
  public onVideoStreamCreated: ((stream: MediaStream) => void) | null = null
  public onChatThreadReady: ((threadId: string) => void) | null = null
  public onHandLowered: (() => void) | null = null
  
  // Hand raise state
  private _isHandRaised = false
  
  // Track initialization state
  private _isInitialized = false
  private _lastDisplayName: string | null = null
  
  // Check if initialized
  get isInitializedForAgent(): string | null {
    return this._isInitialized ? this._lastDisplayName : null
  }

  /**
   * Initialize the ACS client with credentials
   */
  async initialize(token: string, displayName: string): Promise<void> {
    console.log('Initializing ACS CallClient...')
    
    // Guard against hung initialization by adding a timeout
    const initWithTimeout = async <T>(promise: Promise<T>, ms: number, step: string): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${step} timed out after ${ms}ms`)), ms))
      ])
    }

    try {
      this.callClient = new CallClient()
      const tokenCredential = new AzureCommunicationTokenCredential(token)
      
      console.log('Creating CallAgent...')
      this.callAgent = await initWithTimeout(
        this.callClient.createCallAgent(tokenCredential, { displayName }),
        20000,
        'CallAgent creation'
      )
      
      this._isInitialized = true
      this._lastDisplayName = displayName
      
      console.log(`CallAgent created for: ${displayName}`)
      ;(window as unknown as { acsCallService?: AcsCallService }).acsCallService = this
      
      // Set up call agent event handlers
      this.callAgent.on('callsUpdated', (e) => {
        console.log(`Calls updated: ${e.added.length} added, ${e.removed.length} removed`)
      })

      this.callAgent.on('incomingCall', async (e) => {
        console.log('Incoming call received!')
        const incomingCall = e.incomingCall
        // Auto-accept for agent mode
        this.currentCall = await incomingCall.accept()
        this.setupCallHandlers()
      })
    } catch (error) {
      this._isInitialized = false
      this._lastDisplayName = null
      this.callAgent = null
      this.callClient = null
      const message = error instanceof Error ? error.message : 'Unknown error during ACS initialization'
      console.error('ACS initialize failed:', message)
      throw new Error(`ACS initialize failed: ${message}`)
    }
  }

  /**
   * Join a Teams meeting
   */
  async joinMeeting(meetingUrl: string): Promise<void> {
    if (!this.callAgent) {
      throw new Error('Call agent not initialized')
    }
    
    // Prevent duplicate join attempts
    if (this.currentCall) {
      console.log('Already in a call or joining, ignoring duplicate join request')
      return
    }

    console.log(`Joining Teams meeting: ${meetingUrl}`)
    
    // Create TTS audio stream for speech injection
    const audioMediaStream = this.createTtsAudioStream()
    const videoMediaStream = this.createVideoStream()
    
    // Resume audio context if needed
    if (window.ttsAudioContext?.state === 'suspended') {
      console.log('Resuming TTS audio context...')
      await window.ttsAudioContext.resume()
    }
    
    const localAudioStream = new LocalAudioStream(audioMediaStream)
    const localVideoStream = new LocalVideoStream(videoMediaStream)
    
    console.log('Audio and video streams created')
    
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
      this.currentCall = this.callAgent.join({ meetingLink: meetingUrl }, callOptions)
    } else {
      this.currentCall = this.callAgent.startCall(
        [{ communicationUserId: meetingUrl }],
        callOptions
      )
    }
    
    console.log('Call object created, setting up handlers...')
    this.setupCallHandlers()
  }

  /**
   * Create TTS audio stream for speech injection into call
   */
  private createTtsAudioStream(): MediaStream {
    const context = new AudioContext()
    const dest = context.createMediaStreamDestination()
    
    const gainNode = context.createGain()
    gainNode.gain.value = 0 // Start silent
    gainNode.connect(dest)
    
    // Store globally for TTS service to use
    window.ttsAudioContext = context
    window.ttsGainNode = gainNode
    window.ttsDestination = dest
    
    console.log('TTS Audio stream created with context:', context.state)
    return dest.stream
  }

  /**
   * Create animated video stream - Perplexity-style particle sphere visualization
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
    
    setInterval(() => {
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
    window.agentVideoPreviewCanvas = canvas
    window.agentVideoPreviewStream = stream
    this.onVideoStreamCreated?.(stream)

    return stream
  }

  /**
   * Set up event handlers for the current call
   */
  private setupCallHandlers(): void {
    if (!this.currentCall) return
    
    // Mute state changes
    this.currentCall.on('isMutedChanged', () => {
      const muted = this.currentCall!.isMuted
      console.log('Mute state changed:', muted)
      this.onMuteChanged?.(muted)
    })
    
    // Call state changes
    this.currentCall.on('stateChanged', async () => {
      const state = this.currentCall!.state as CallState
      console.log('Call state changed:', state)
      this.lastKnownState = state
      this.onStateChanged?.(state)
      
      if (state === 'Connected') {
        console.log('Call connected, setting up captions...')
        await this.setupCaptions()
        // Start state monitoring as backup
        this.startStateMonitoring()
        // Notify about chat thread (for Teams meeting chat interop)
        this.notifyChatThreadReady()
      } else if (state === 'Disconnected' || state === 'Disconnecting') {
        const reason = this.currentCall!.callEndReason as CallEndReason | undefined
        console.log('Call disconnected/disconnecting:', state, reason)
        
        // Log specific end reasons for debugging
        if (reason) {
          // Common reason codes:
          // 0 = Normal hangup
          // 487 = Call canceled
          // 603 = Declined
          // 410/480 = Meeting ended for everyone (varies by scenario)
          console.log(`Call end reason: code=${reason.code}, subCode=${reason.subCode}`)
        }
        
        if (state === 'Disconnected') {
          this.onCallEnded?.(reason || null)
          this.cleanup()
        }
      }
    })
    
    // Recording feature
    this.currentCall.feature(Features.Recording).on('isRecordingActiveChanged', () => {
      if ((this.currentCall!.feature(Features.Recording) as unknown as { isRecordingActive: boolean }).isRecordingActive) {
        console.log('This call is being recorded')
      }
    })
    
    // Remote participants
    this.currentCall.on('remoteParticipantsUpdated', (e) => {
      console.log(`Participants: +${e.added.length} -${e.removed.length}`)
      e.added.forEach((participant) => {
        this.onParticipantAdded?.({
          id: (participant as unknown as { identifier: { communicationUserId: string } }).identifier?.communicationUserId || crypto.randomUUID(),
          displayName: participant.displayName || 'Unknown',
          isMuted: participant.isMuted,
          isSpeaking: (participant as unknown as { isSpeaking: boolean }).isSpeaking || false
        })
      })
      e.removed.forEach((participant) => {
        this.onParticipantRemoved?.((participant as unknown as { identifier: { communicationUserId: string } }).identifier?.communicationUserId || '')
      })
    })
  }

  /**
   * Start monitoring call state as a backup to catch missed disconnection events
   */
  private startStateMonitoring(): void {
    // Clear any existing interval
    if (this.callStateCheckInterval) {
      clearInterval(this.callStateCheckInterval)
    }
    
    // Check call state every 2 seconds as backup
    this.callStateCheckInterval = setInterval(() => {
      if (!this.currentCall) {
        console.log('[StateMonitor] No current call, stopping monitor')
        this.stopStateMonitoring()
        return
      }
      
      const currentState = this.currentCall.state as CallState
      
      // If we detect a state change that wasn't caught by the event
      if (currentState !== this.lastKnownState) {
        console.log(`[StateMonitor] State changed: ${this.lastKnownState} -> ${currentState}`)
        this.lastKnownState = currentState
        this.onStateChanged?.(currentState)
        
        if (currentState === 'Disconnected') {
          const reason = this.currentCall.callEndReason as CallEndReason | undefined
          console.log('[StateMonitor] Call disconnected, triggering cleanup', reason)
          this.onCallEnded?.(reason || null)
          this.cleanup()
        }
      }
    }, 2000)
  }

  /**
   * Stop state monitoring
   */
  private stopStateMonitoring(): void {
    if (this.callStateCheckInterval) {
      clearInterval(this.callStateCheckInterval)
      this.callStateCheckInterval = null
    }
  }

  /**
   * Notify when chat thread is ready (for Teams meeting chat interop)
   */
  private notifyChatThreadReady(): void {
    const threadId = this.getThreadId()
    if (threadId && this.onChatThreadReady) {
      console.log('Chat thread ready:', threadId.substring(0, 30) + '...')
      this.onChatThreadReady(threadId)
    } else if (!threadId) {
      console.log('No chat thread ID available (not a Teams meeting?)')
    }
  }

  /**
   * Get the chat thread ID for the current Teams meeting
   * This is available after joining a Teams meeting
   */
  getThreadId(): string | null {
    if (!this.currentCall) {
      return null
    }
    // The threadId is available from call.info for Teams meetings
    const callInfo = this.currentCall.info as { threadId?: string } | undefined
    return callInfo?.threadId || null
  }

  /**
   * Set up closed captions
   */
  private async setupCaptions(): Promise<void> {
    if (!this.currentCall) return
    
    try {
      console.log('Setting up closed captions...')
      
      const captionsFeature = this.currentCall.feature(Features.Captions)
      const captions = captionsFeature.captions as unknown as {
        kind: string
        isCaptionsFeatureActive: boolean
        startCaptions: (options: { spokenLanguage: string }) => Promise<void>
        on: (event: string, callback: (data: CaptionData) => void) => void
      }
      
      if (captions.kind === 'TeamsCaptions') {
        this._teamsCaptions = captions
        console.log('TeamsCaptions feature available')
        
        // Subscribe to caption events
        captions.on('CaptionsReceived', (data: CaptionData) => {
          if (data.resultType === 'Final' && (data.captionText || data.spokenText)) {
            const caption: Caption = {
              id: crypto.randomUUID(),
              speaker: data.speaker?.displayName || 'Unknown',
              text: data.captionText || data.spokenText || '',
              timestamp: new Date(),
              isFinal: true
            }
            this.onCaptionReceived?.(caption)
          }
        })
        
        // Start captions
        if (!captions.isCaptionsFeatureActive) {
          await captions.startCaptions({ spokenLanguage: 'en-us' })
          console.log('Captions started')
        } else {
          console.log('Captions already active')
        }
      }
    } catch (error) {
      console.error('Failed to setup captions:', error)
    }
  }

  /**
   * Toggle mute state
   */
  async toggleMute(): Promise<boolean> {
    if (!this.currentCall) {
      throw new Error('No active call')
    }
    
    const currentMute = this.currentCall.isMuted
    
    if (currentMute) {
      await this.currentCall.unmute()
    } else {
      await this.currentCall.mute()
    }
    
    return !currentMute
  }

  /**
   * Leave the current call
   */
  async leaveCall(): Promise<void> {
    if (this.currentCall) {
      await this.currentCall.hangUp()
      console.log('Call ended by user')
    }
  }

  /**
   * Send a reaction in the current call
   * @param reactionType - The type of reaction: 'like', 'love', 'applause', 'laugh', 'surprised'
   */
  async sendReaction(reactionType: ReactionType = 'like'): Promise<boolean> {
    if (!this.currentCall) {
      console.warn('Cannot send reaction: No active call')
      return false
    }

    if (this.currentCall.state !== 'Connected') {
      console.warn('Cannot send reaction: Call not connected')
      return false
    }

    try {
      const reactionFeature = this.currentCall.feature(Features.Reaction)
      const reactionMessage: ReactionMessage = {
        reactionType: reactionType
      }
      
      await reactionFeature.sendReaction(reactionMessage)
      console.log(`👍 Reaction sent: ${reactionType}`)
      return true
    } catch (error) {
      console.error('Failed to send reaction:', error)
      return false
    }
  }

  /**
   * Send a thumbs up (like) reaction - convenience method
   */
  async sendThumbsUp(): Promise<boolean> {
    return this.sendReaction('like')
  }

  /**
   * Raise hand for the local participant
   */
  async raiseHand(): Promise<boolean> {
    if (!this.currentCall) {
      console.warn('Cannot raise hand: No active call')
      return false
    }

    if (this.currentCall.state !== 'Connected') {
      console.warn('Cannot raise hand: Call not connected')
      return false
    }

    try {
      const raiseHandFeature = this.currentCall.feature(Features.RaiseHand)
      await raiseHandFeature.raiseHand()
      this._isHandRaised = true
      console.log('✋ Hand raised')
      
      // Listen for hand lowered event (by host or by us)
      raiseHandFeature.on('loweredHandEvent', () => {
        console.log('✋ Hand was lowered')
        this._isHandRaised = false
        if (this.onHandLowered) {
          this.onHandLowered()
        }
      })
      
      return true
    } catch (error) {
      console.error('Failed to raise hand:', error)
      return false
    }
  }

  /**
   * Lower hand for the local participant
   */
  async lowerHand(): Promise<boolean> {
    if (!this.currentCall) {
      console.warn('Cannot lower hand: No active call')
      return false
    }

    try {
      const raiseHandFeature = this.currentCall.feature(Features.RaiseHand)
      await raiseHandFeature.lowerHand()
      this._isHandRaised = false
      console.log('✋ Hand lowered')
      return true
    } catch (error) {
      console.error('Failed to lower hand:', error)
      return false
    }
  }

  /**
   * Check if hand is currently raised
   */
  isHandRaised(): boolean {
    return this._isHandRaised
  }

  /**
   * Get current mute state
   */
  isMuted(): boolean {
    return this.currentCall?.isMuted ?? false
  }

  /**
   * Get current call state
   */
  getState(): CallState {
    return (this.currentCall?.state as CallState) ?? 'None'
  }

  /**
   * Check if captions are active
   */
  areCaptionsActive(): boolean {
    return this._teamsCaptions !== null
  }

  /**
   * Check if in a call
   */
  isInCall(): boolean {
    return this.currentCall !== null && this.currentCall.state === 'Connected'
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Stop state monitoring
    this.stopStateMonitoring()
    
    this.currentCall = null
    this._teamsCaptions = null
    this.lastKnownState = 'None'
    
    // Clean up audio context
    if (window.ttsAudioContext) {
      window.ttsAudioContext.close()
      window.ttsAudioContext = null
      window.ttsGainNode = null
      window.ttsDestination = null
    }
  }

  /**
   * Dispose of the service
   */
  async dispose(): Promise<void> {
    this.stopStateMonitoring()
    if (this.currentCall) {
      await this.currentCall.hangUp()
    }
    if (this.callAgent) {
      await this.callAgent.dispose()
    }
    this.cleanup()
    this.callClient = null
    this.callAgent = null
  }

  /**
   * Reset the ACS service for switching agents. Now properly async to ensure cleanup completes.
   */
  async reset(): Promise<void> {
    console.log('🔄 ACS Service reset called')
    this.stopStateMonitoring()
    
    // Hang up any current call first
    if (this.currentCall) {
      try {
        await this.currentCall.hangUp()
        console.log('🔄 Current call hung up')
      } catch (err) {
        console.warn('ACS hangUp during reset failed', err)
      }
      this.currentCall = null
    }
    
    // Dispose call agent
    if (this.callAgent) {
      try {
        await this.callAgent.dispose()
        console.log('🔄 Call agent disposed')
      } catch (err) {
        console.warn('ACS callAgent dispose during reset failed', err)
      }
      this.callAgent = null
    }
    
    this.cleanup()
    this.callClient = null
    this._isInitialized = false
    this._lastDisplayName = null
    console.log('🔄 ACS Service reset complete')
  }
}

// Singleton instance
let instance: AcsCallService | null = null

export function getAcsCallService(): AcsCallService {
  if (!instance) {
    instance = new AcsCallService()
  }
  return instance
}
