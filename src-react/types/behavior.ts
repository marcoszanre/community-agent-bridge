// ============================================
// Agent Behavior Pattern Types
// Defines trigger sources, response channels, and behavior modes
// ============================================

/**
 * Sources that can trigger the agent
 */
export type TriggerSource = 'caption-mention' | 'chat-mention'

/**
 * Channels through which the agent can respond
 */
export type ResponseChannel = 'chat' | 'speech' | 'both'

/**
 * Behavior modes determining how the agent handles responses
 * 
 * - immediate: Respond as soon as possible, no human approval needed
 * - controlled: Queue response and wait for controller approval
 * - queued: Raise hand, wait for acknowledgment (hand lowered), then respond
 */
export type BehaviorMode = 'immediate' | 'controlled' | 'queued'

/**
 * Options specific to queued behavior mode
 */
export interface QueuedBehaviorOptions {
  /** Automatically raise hand when response is ready */
  autoRaiseHand: boolean
  /** Automatically speak when hand is lowered (acknowledged) */
  speakOnLower: boolean
}

/**
 * Options specific to controlled behavior mode
 */
export interface ControlledBehaviorOptions {
  /** Show response preview to controller (read-only) */
  showPreview: boolean
}

/**
 * Configuration for a specific trigger source
 */
export interface TriggerConfig {
  /** Whether this trigger is enabled */
  enabled: boolean
  /** Channel to use when responding to this trigger */
  responseChannel: ResponseChannel
  /** Behavior mode for this trigger */
  behaviorMode: BehaviorMode
  /** Options for queued mode */
  queuedOptions?: QueuedBehaviorOptions
  /** Options for controlled mode */
  controlledOptions?: ControlledBehaviorOptions
}

/**
 * Complete agent behavior pattern configuration
 * Each trigger source can have independent settings
 */
export interface AgentBehaviorPattern {
  /** Unique identifier for the pattern */
  id: string
  /** Human-readable name */
  name: string
  /** Description of the pattern */
  description?: string
  /** Whether this is a built-in preset */
  isPreset: boolean
  
  /** Configuration for caption mention triggers */
  captionMention: TriggerConfig
  
  /** Configuration for chat mention triggers */
  chatMention: TriggerConfig
}

/**
 * Status of a pending response in the queue
 */
export type PendingResponseStatus = 
  | 'pending'           // Waiting for approval/action
  | 'approved'          // Approved, ready to send
  | 'rejected'          // Rejected by controller
  | 'hand-raised'       // Hand raised, waiting for acknowledgment
  | 'sending'           // Currently being sent/spoken
  | 'sent'              // Successfully delivered
  | 'failed'            // Failed to deliver
  | 'dismissed'         // Auto-dismissed (stale)

/**
 * A response waiting to be processed
 */
export interface PendingResponse {
  /** Unique identifier */
  id: string
  /** When the response was created */
  createdAt: Date
  /** What triggered this response */
  triggerSource: TriggerSource
  /** The original message/mention that triggered the response */
  triggerContent: string
  /** Who triggered the response (speaker/sender name) */
  triggerAuthor: string
  /** The generated response text */
  responseText: string
  /** Channel to use for response */
  responseChannel: ResponseChannel
  /** Current status */
  status: PendingResponseStatus
  /** Behavior mode that created this pending response */
  behaviorMode: BehaviorMode
  /** When status last changed */
  statusChangedAt: Date
  /** Error message if failed */
  errorMessage?: string
}

/**
 * Statistics about the pending queue
 */
export interface QueueStats {
  total: number
  pending: number
  approved: number
  rejected: number
  sent: number
  failed: number
}

/**
 * Events emitted by the behavior processor
 */
export type BehaviorEvent = 
  | { type: 'trigger-detected'; source: TriggerSource; content: string; author: string }
  | { type: 'response-generated'; pendingId: string; responseText: string }
  | { type: 'response-queued'; pendingId: string; mode: BehaviorMode }
  | { type: 'response-approved'; pendingId: string }
  | { type: 'response-rejected'; pendingId: string }
  | { type: 'response-sending'; pendingId: string; channel: ResponseChannel }
  | { type: 'response-sent'; pendingId: string }
  | { type: 'response-failed'; pendingId: string; error: string }
  | { type: 'hand-raised'; pendingId: string }
  | { type: 'hand-lowered'; pendingId?: string }

/**
 * Callback type for behavior events
 */
export type BehaviorEventCallback = (event: BehaviorEvent) => void
