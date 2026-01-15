// ============================================
// useBehaviorProcessor Hook
// Integrates BehaviorProcessor with meeting provider and agent
// ============================================

import { useEffect, useCallback, useRef } from 'react'
import { 
  getBehaviorProcessor, 
  disposeBehaviorProcessor,
  type BehaviorProcessorConfig,
  type TriggerContext
} from '@/services'
import { useAgentBehaviorStore } from '@/stores'
import type { 
  MeetingChatMessage,
  MeetingCaption,
  BehaviorEventCallback
} from '@/types'

interface UseBehaviorProcessorOptions {
  /** Agent's display name for mention detection */
  agentDisplayName: string
  /** Alternative names/aliases for the agent */
  agentNameVariations?: string[]
  /** Function to generate responses (typically from agent provider) */
  generateResponse: (context: TriggerContext) => Promise<{ text: string }>
  /** Function to send chat messages */
  sendChat: (message: string) => Promise<void>
  /** Function to speak via TTS */
  speak: (text: string) => Promise<void>
  /** Function to raise hand in meeting */
  raiseHand: () => Promise<void>
  /** Function to lower hand in meeting */
  lowerHand: () => Promise<void>
  /** Callback for behavior events */
  onEvent?: BehaviorEventCallback
  /** Whether the processor should be active */
  enabled?: boolean
}

export function useBehaviorProcessor(options: UseBehaviorProcessorOptions) {
  const {
    agentDisplayName,
    agentNameVariations,
    generateResponse,
    sendChat,
    speak,
    raiseHand,
    lowerHand,
    onEvent,
    enabled = true
  } = options
  
  const processorRef = useRef(getBehaviorProcessor())
  const isInitializedRef = useRef(false)
  
  // Store selectors
  const currentPattern = useAgentBehaviorStore(state => state.getCurrentPattern())
  const pendingResponses = useAgentBehaviorStore(state => state.pendingResponses)
  const isHandRaised = useAgentBehaviorStore(state => state.isHandRaised)
  
  // Initialize processor
  useEffect(() => {
    if (!enabled) {
      if (isInitializedRef.current) {
        processorRef.current.dispose()
        isInitializedRef.current = false
      }
      return
    }
    
    const config: BehaviorProcessorConfig = {
      agentDisplayName,
      agentNameVariations,
      responseGenerator: generateResponse,
      sendChat,
      speak,
      raiseHand,
      lowerHand
    }
    
    processorRef.current.initialize(config)
    isInitializedRef.current = true
    
    // Subscribe to events if callback provided
    let unsubscribe: (() => void) | undefined
    if (onEvent) {
      unsubscribe = processorRef.current.addEventListener(onEvent)
    }
    
    return () => {
      unsubscribe?.()
    }
  }, [
    enabled, 
    agentDisplayName, 
    agentNameVariations, 
    generateResponse, 
    sendChat, 
    speak, 
    raiseHand, 
    lowerHand,
    onEvent
  ])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInitializedRef.current) {
        disposeBehaviorProcessor()
        isInitializedRef.current = false
      }
    }
  }, [])
  
  /**
   * Handle incoming chat message - check for mentions
   */
  const handleChatMessage = useCallback((message: MeetingChatMessage) => {
    const processor = processorRef.current
    if (!processor.isReady || !enabled) return
    
    // Check if message mentions the agent
    if (message.mentionsMe || processor.isMentionOfAgent(message.content)) {
      console.log(`💬 Chat mention detected from ${message.senderDisplayName}`)
      processor.processChatMention(message)
    }
  }, [enabled])
  
  /**
   * Handle incoming caption - check for mentions
   */
  const handleCaption = useCallback((caption: MeetingCaption) => {
    const processor = processorRef.current
    if (!processor.isReady || !enabled) return
    
    // Only process final captions
    if (!caption.isFinal) return
    
    // Check if caption mentions the agent
    if (processor.isMentionOfAgent(caption.text)) {
      console.log(`🎤 Caption mention detected from ${caption.speaker}`)
      processor.processCaptionMention(
        caption.speaker,
        caption.text,
        caption.speakerId
      )
    }
  }, [enabled])
  
  /**
   * Handle hand state change from meeting
   */
  const handleHandStateChanged = useCallback((raised: boolean) => {
    const processor = processorRef.current
    if (!processor.isReady) return
    
    processor.onHandRaisedStateChanged(raised)
  }, [])
  
  /**
   * Approve a pending response (for controlled mode)
   */
  const approveResponse = useCallback((pendingId: string) => {
    processorRef.current.approveResponse(pendingId)
  }, [])
  
  /**
   * Reject a pending response
   */
  const rejectResponse = useCallback((pendingId: string) => {
    processorRef.current.rejectResponse(pendingId)
  }, [])
  
  /**
   * Get pending responses that need controller action
   */
  const getPendingForApproval = useCallback(() => {
    return pendingResponses.filter(r => r.status === 'pending')
  }, [pendingResponses])
  
  /**
   * Get responses waiting for hand acknowledgment
   */
  const getWaitingForHand = useCallback(() => {
    return pendingResponses.filter(r => r.status === 'hand-raised')
  }, [pendingResponses])
  
  return {
    // State
    isReady: isInitializedRef.current && enabled,
    currentPattern,
    pendingResponses,
    isHandRaised,
    
    // Handlers for meeting events
    handleChatMessage,
    handleCaption,
    handleHandStateChanged,
    
    // Controller actions
    approveResponse,
    rejectResponse,
    
    // Computed
    pendingForApproval: getPendingForApproval(),
    waitingForHand: getWaitingForHand(),
    pendingCount: pendingResponses.filter(r => r.status === 'pending').length
  }
}

export default useBehaviorProcessor
