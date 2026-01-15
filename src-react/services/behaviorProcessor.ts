        // ============================================
// Behavior Processor Service
// Coordinates trigger detection, pattern matching, and response routing
// ============================================

import type { 
  TriggerSource, 
  AgentBehaviorPattern,
  TriggerConfig,
  PendingResponse,
  BehaviorEvent,
  BehaviorEventCallback,
  MeetingChatMessage
} from '@/types'
import { useAgentBehaviorStore } from '@/stores'
import { extractMessageText } from '@/lib/utils'

/**
 * Context for generating a response
 */
export interface TriggerContext {
  source: TriggerSource
  content: string
  author: string
  authorId?: string
  timestamp: Date
  /** Additional context from the meeting */
  meetingContext?: {
    recentCaptions?: string[]
    participantCount?: number
  }
}

/**
 * Result from response generation
 */
export interface GeneratedResponse {
  text: string
  confidence?: number
}

/**
 * Response generator function type
 * This will be provided by the agent provider (Copilot Studio, OpenAI, etc.)
 */
export type ResponseGenerator = (context: TriggerContext) => Promise<GeneratedResponse>

/**
 * Response sender function types
 */
export type ChatSender = (message: string) => Promise<void>
export type SpeechSender = (text: string) => Promise<void>
export type HandRaiser = () => Promise<void>
export type HandLowerer = () => Promise<void>

/**
 * Configuration for the behavior processor
 */
export interface BehaviorProcessorConfig {
  /** Function to generate responses (from agent) */
  responseGenerator: ResponseGenerator
  /** Function to send chat messages */
  sendChat: ChatSender
  /** Function to speak via TTS */
  speak: SpeechSender
  /** Function to raise hand */
  raiseHand: HandRaiser
  /** Function to lower hand */
  lowerHand: HandLowerer
  /** Agent's display name (for detecting self-mentions) */
  agentDisplayName: string
  /** Variations of agent name that count as mentions */
  agentNameVariations?: string[]
}

/**
 * Behavior Processor
 * Manages the flow from trigger detection to response delivery
 */
export class BehaviorProcessor {
  private config: BehaviorProcessorConfig | null = null
  private eventListeners: Set<BehaviorEventCallback> = new Set()
  private unsubscribeFromStore: (() => void) | null = null
  
  /**
   * Initialize the processor with configuration
   */
  initialize(config: BehaviorProcessorConfig): void {
    this.config = config
    
    // Subscribe to store events for hand state changes
    this.unsubscribeFromStore = useAgentBehaviorStore.getState().addEventListener(
      this.handleStoreEvent.bind(this)
    )
    
    console.log('🎯 BehaviorProcessor initialized')
  }
  
  /**
   * Dispose of the processor
   */
  dispose(): void {
    if (this.unsubscribeFromStore) {
      this.unsubscribeFromStore()
      this.unsubscribeFromStore = null
    }
    this.config = null
    this.eventListeners.clear()
    console.log('🎯 BehaviorProcessor disposed')
  }
  
  /**
   * Check if processor is ready
   */
  get isReady(): boolean {
    return this.config !== null
  }
  
  /**
   * Process a caption mention trigger
   */
  async processCaptionMention(
    speakerName: string, 
    captionText: string,
    speakerId?: string
  ): Promise<void> {
    await this.processTrigger({
      source: 'caption-mention',
      content: captionText,
      author: speakerName,
      authorId: speakerId,
      timestamp: new Date()
    })
  }
  
  /**
   * Process a chat mention trigger
   */
  async processChatMention(message: MeetingChatMessage): Promise<void> {
    // Extract plain text from HTML content (Teams uses HTML for mentions)
    const plainTextContent = extractMessageText(message.content)
    
    await this.processTrigger({
      source: 'chat-mention',
      content: plainTextContent,
      author: message.senderDisplayName,
      authorId: message.senderId,
      timestamp: message.timestamp
    })
  }
  
  /**
   * Check if text contains a mention of the agent
   */
  isMentionOfAgent(text: string): boolean {
    if (!this.config) return false
    
    const lowerText = text.toLowerCase()
    const namesToCheck = [
      this.config.agentDisplayName.toLowerCase(),
      ...(this.config.agentNameVariations || []).map(n => n.toLowerCase())
    ]
    
    return namesToCheck.some(name => {
      // Check for @mention
      if (lowerText.includes(`@${name}`)) return true
      // Check for direct name mention
      if (lowerText.includes(name)) return true
      return false
    })
  }
  
  /**
   * Approve a pending response (for controlled mode)
   */
  approveResponse(pendingId: string): void {
    const store = useAgentBehaviorStore.getState()
    store.approveResponse(pendingId)
    
    // Process the approved response
    const pending = store.pendingResponses.find(r => r.id === pendingId)
    if (pending) {
      this.deliverResponse(pending)
    }
  }
  
  /**
   * Reject a pending response
   */
  rejectResponse(pendingId: string): void {
    useAgentBehaviorStore.getState().rejectResponse(pendingId)
  }
  
  /**
   * Handle hand lowered event (for queued mode)
   */
  async onHandLowered(): Promise<void> {
    const store = useAgentBehaviorStore.getState()
    store.setHandRaised(false)
    
    // Find the pending response waiting for hand acknowledgment
    const pending = store.getNextPendingForHand()
    if (pending) {
      console.log(`🎯 Hand lowered, delivering queued response: ${pending.id}`)
      await this.deliverResponse(pending)
    }
  }
  
  /**
   * Handle hand raised state change from meeting
   */
  onHandRaisedStateChanged(isRaised: boolean): void {
    const store = useAgentBehaviorStore.getState()
    
    // Only handle if hand was lowered (not raised by us)
    if (!isRaised && store.isHandRaised) {
      this.onHandLowered()
    }
    
    store.setHandRaised(isRaised)
  }
  
  /**
   * Add event listener
   */
  addEventListener(callback: BehaviorEventCallback): () => void {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }
  
  // ============================================
  // Private Methods
  // ============================================
  
  /**
   * Process a trigger through the full workflow
   */
  private async processTrigger(context: TriggerContext): Promise<void> {
    if (!this.config) {
      console.warn('🎯 BehaviorProcessor not initialized')
      return
    }
    
    const store = useAgentBehaviorStore.getState()
    const pattern = store.getCurrentPattern()
    const triggerConfig = this.getTriggerConfig(pattern, context.source)
    
    // Check if trigger is enabled
    if (!triggerConfig.enabled) {
      console.log(`🎯 Trigger ${context.source} is disabled in current pattern`)
      return
    }
    
    this.emitEvent({ 
      type: 'trigger-detected', 
      source: context.source, 
      content: context.content,
      author: context.author
    })
    
    console.log(`🎯 Processing ${context.source} from ${context.author}: "${context.content.substring(0, 50)}..."`)
    
    try {
      // Generate response
      const response = await this.config.responseGenerator(context)
      
      this.emitEvent({
        type: 'response-generated',
        pendingId: '', // Will be set after queuing
        responseText: response.text
      })
      
      // Create pending response
      const pending = store.addPendingResponse({
        triggerSource: context.source,
        triggerContent: context.content,
        triggerAuthor: context.author,
        responseText: response.text,
        responseChannel: triggerConfig.responseChannel
      })
      
      // Route based on behavior mode
      await this.routeByBehaviorMode(pending, triggerConfig)
      
    } catch (error) {
      console.error('🎯 Error processing trigger:', error)
      this.emitEvent({
        type: 'response-failed',
        pendingId: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  
  /**
   * Route response based on behavior mode
   */
  private async routeByBehaviorMode(
    pending: PendingResponse, 
    triggerConfig: TriggerConfig
  ): Promise<void> {
    const store = useAgentBehaviorStore.getState()
    
    switch (triggerConfig.behaviorMode) {
      case 'immediate':
        // Send immediately
        await this.deliverResponse(pending)
        break
        
      case 'controlled':
        // Keep in pending state, wait for controller approval
        console.log(`🎯 Response queued for controller approval: ${pending.id}`)
        // UI will show this in the pending queue
        break
        
      case 'queued':
        // Raise hand and wait
        if (triggerConfig.queuedOptions?.autoRaiseHand) {
          store.updateResponseStatus(pending.id, 'hand-raised')
          await this.raiseHandForResponse(pending)
        }
        break
    }
  }
  
  /**
   * Deliver a response through the configured channel
   */
  private async deliverResponse(pending: PendingResponse): Promise<void> {
    if (!this.config) return
    
    const store = useAgentBehaviorStore.getState()
    store.updateResponseStatus(pending.id, 'sending')
    
    this.emitEvent({
      type: 'response-sending',
      pendingId: pending.id,
      channel: pending.responseChannel
    })
    
    try {
      switch (pending.responseChannel) {
        case 'chat':
          await this.config.sendChat(pending.responseText)
          break
          
        case 'speech':
          await this.config.speak(pending.responseText)
          break
          
        case 'both':
          // Send both in parallel
          await Promise.all([
            this.config.sendChat(pending.responseText),
            this.config.speak(pending.responseText)
          ])
          break
      }
      
      store.updateResponseStatus(pending.id, 'sent')
      this.emitEvent({ type: 'response-sent', pendingId: pending.id })
      
      console.log(`🎯 Response delivered via ${pending.responseChannel}: ${pending.id}`)
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Delivery failed'
      store.updateResponseStatus(pending.id, 'failed', errorMessage)
      this.emitEvent({ 
        type: 'response-failed', 
        pendingId: pending.id, 
        error: errorMessage 
      })
    }
  }
  
  /**
   * Raise hand for a queued response
   */
  private async raiseHandForResponse(pending: PendingResponse): Promise<void> {
    if (!this.config) return
    
    try {
      await this.config.raiseHand()
      useAgentBehaviorStore.getState().setHandRaised(true)
      
      this.emitEvent({ type: 'hand-raised', pendingId: pending.id })
      console.log(`🎯 Hand raised for response: ${pending.id}`)
      
    } catch (error) {
      console.error('🎯 Failed to raise hand:', error)
      // Fallback: deliver via chat instead
      const store = useAgentBehaviorStore.getState()
      store.updateResponseStatus(pending.id, 'pending')
    }
  }
  
  /**
   * Get trigger config for a source from pattern
   */
  private getTriggerConfig(pattern: AgentBehaviorPattern, source: TriggerSource): TriggerConfig {
    return source === 'caption-mention' 
      ? pattern.captionMention 
      : pattern.chatMention
  }
  
  /**
   * Handle events from the store
   */
  private handleStoreEvent(event: BehaviorEvent): void {
    // Forward store events to our listeners
    this.emitEvent(event)
  }
  
  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: BehaviorEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event)
      } catch (e) {
        console.error('Error in behavior event listener:', e)
      }
    })
  }
}

// Singleton instance
let processorInstance: BehaviorProcessor | null = null

/**
 * Get the singleton behavior processor instance
 */
export function getBehaviorProcessor(): BehaviorProcessor {
  if (!processorInstance) {
    processorInstance = new BehaviorProcessor()
  }
  return processorInstance
}

/**
 * Dispose the singleton instance
 */
export function disposeBehaviorProcessor(): void {
  if (processorInstance) {
    processorInstance.dispose()
    processorInstance = null
  }
}
