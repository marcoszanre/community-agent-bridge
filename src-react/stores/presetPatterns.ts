// ============================================
// Preset Behavior Patterns
// Built-in patterns for common agent behaviors
// ============================================

import type { AgentBehaviorPattern, TriggerConfig } from '@/types'

/**
 * Default trigger config - disabled, immediate mode
 */
const disabledTrigger: TriggerConfig = {
  enabled: false,
  responseChannel: 'chat',
  behaviorMode: 'immediate'
}

/**
 * Immediate voice response config
 */
const immediateVoice: TriggerConfig = {
  enabled: true,
  responseChannel: 'speech',
  behaviorMode: 'immediate'
}

/**
 * Immediate chat response config
 */
const immediateChat: TriggerConfig = {
  enabled: true,
  responseChannel: 'chat',
  behaviorMode: 'immediate'
}

/**
 * Controlled/supervised voice response config
 */
const controlledVoice: TriggerConfig = {
  enabled: true,
  responseChannel: 'speech',
  behaviorMode: 'controlled',
  controlledOptions: {
    showPreview: true
  }
}

/**
 * Controlled/supervised chat response config
 */
const controlledChat: TriggerConfig = {
  enabled: true,
  responseChannel: 'chat',
  behaviorMode: 'controlled',
  controlledOptions: {
    showPreview: true
  }
}

/**
 * Queued voice response (raise hand) config
 */
const queuedVoice: TriggerConfig = {
  enabled: true,
  responseChannel: 'speech',
  behaviorMode: 'queued',
  queuedOptions: {
    autoRaiseHand: true,
    speakOnLower: true
  }
}

/**
 * Queued chat response config
 */
// Note: queuedChat available for future patterns that may need queued chat behavior
const _queuedChat: TriggerConfig = {
  enabled: true,
  responseChannel: 'chat',
  behaviorMode: 'queued',
  queuedOptions: {
    autoRaiseHand: true,
    speakOnLower: false // Chat doesn't need hand acknowledgment
  }
}
void _queuedChat // Suppress unused warning - available for custom patterns

// ============================================
// PRESET PATTERNS
// ============================================

export const PRESET_PATTERNS: Record<string, AgentBehaviorPattern> = {
  /**
   * AUTONOMOUS VOICE
   * Agent responds immediately via speech to any mention
   * Best for: Demo scenarios, fully autonomous operation
   */
  'autonomous-voice': {
    id: 'autonomous-voice',
    name: 'Autonomous (Voice)',
    description: 'Agent responds immediately via speech to any mention. No human approval needed.',
    isPreset: true,
    captionMention: immediateVoice,
    chatMention: immediateVoice
  },

  /**
   * AUTONOMOUS CHAT
   * Agent responds immediately via chat to any mention
   * Best for: Async scenarios, text-based assistance
   */
  'autonomous-chat': {
    id: 'autonomous-chat',
    name: 'Autonomous (Chat)',
    description: 'Agent responds immediately via chat to any mention. No human approval needed.',
    isPreset: true,
    captionMention: immediateChat,
    chatMention: immediateChat
  },

  /**
   * AUTONOMOUS MIXED
   * Voice mentions get voice responses, chat mentions get chat responses
   * Best for: Natural conversation flow matching the original channel
   */
  'autonomous-mixed': {
    id: 'autonomous-mixed',
    name: 'Autonomous (Mixed)',
    description: 'Agent responds in the same channel as the trigger. Voice→Voice, Chat→Chat.',
    isPreset: true,
    captionMention: immediateVoice,
    chatMention: immediateChat
  },

  /**
   * SUPERVISED
   * All responses require controller approval before sending
   * Best for: High-stakes meetings, quality control scenarios
   */
  'supervised': {
    id: 'supervised',
    name: 'Supervised',
    description: 'All responses require controller approval before being sent.',
    isPreset: true,
    captionMention: controlledVoice,
    chatMention: controlledChat
  },

  /**
   * POLITE QUEUE (Voice)
   * Raises hand when ready to speak, waits for acknowledgment
   * Best for: Formal meetings, not interrupting speakers
   */
  'polite-queue-voice': {
    id: 'polite-queue-voice',
    name: 'Polite Queue (Voice)',
    description: 'Agent raises hand when ready to speak. Speaks when hand is lowered (acknowledged).',
    isPreset: true,
    captionMention: queuedVoice,
    chatMention: queuedVoice
  },

  /**
   * POLITE QUEUE (Mixed)
   * Voice triggers queue with hand raise, chat responds immediately
   * Best for: Balanced approach - polite for voice, responsive for chat
   */
  'polite-queue-mixed': {
    id: 'polite-queue-mixed',
    name: 'Polite Queue (Mixed)',
    description: 'Voice mentions queue with hand raise. Chat mentions respond immediately.',
    isPreset: true,
    captionMention: queuedVoice,
    chatMention: immediateChat
  },

  /**
   * CHAT ONLY - SUPERVISED
   * Only responds to chat mentions, with approval
   * Best for: Text-only assistance with oversight
   */
  'chat-only-supervised': {
    id: 'chat-only-supervised',
    name: 'Chat Only (Supervised)',
    description: 'Only responds to chat mentions. Requires controller approval.',
    isPreset: true,
    captionMention: disabledTrigger,
    chatMention: controlledChat
  },

  /**
   * VOICE ONLY - AUTONOMOUS
   * Only responds to voice mentions, immediately
   * Best for: Voice-first scenarios
   */
  'voice-only-autonomous': {
    id: 'voice-only-autonomous',
    name: 'Voice Only (Autonomous)',
    description: 'Only responds to voice mentions. Responds immediately via speech.',
    isPreset: true,
    captionMention: immediateVoice,
    chatMention: disabledTrigger
  },

  /**
   * SILENT OBSERVER
   * All triggers disabled - agent listens but doesn't respond
   * Best for: Observation mode, gathering context before engaging
   */
  'silent-observer': {
    id: 'silent-observer',
    name: 'Silent Observer',
    description: 'Agent listens to all mentions but does not respond. Use for observation mode.',
    isPreset: true,
    captionMention: disabledTrigger,
    chatMention: disabledTrigger
  }
}

/**
 * Default pattern ID
 */
export const DEFAULT_PATTERN_ID = 'supervised'

/**
 * Get list of preset patterns for UI
 */
export function getPresetPatternList(): AgentBehaviorPattern[] {
  return Object.values(PRESET_PATTERNS)
}

/**
 * Get pattern by ID
 */
export function getPatternById(id: string): AgentBehaviorPattern | undefined {
  return PRESET_PATTERNS[id]
}

/**
 * Get patterns grouped by category for UI display
 */
export function getPatternsByCategory(): Record<string, AgentBehaviorPattern[]> {
  return {
    'Autonomous': [
      PRESET_PATTERNS['autonomous-voice'],
      PRESET_PATTERNS['autonomous-chat'],
      PRESET_PATTERNS['autonomous-mixed']
    ],
    'Supervised': [
      PRESET_PATTERNS['supervised'],
      PRESET_PATTERNS['chat-only-supervised']
    ],
    'Polite Queue': [
      PRESET_PATTERNS['polite-queue-voice'],
      PRESET_PATTERNS['polite-queue-mixed']
    ],
    'Specialized': [
      PRESET_PATTERNS['voice-only-autonomous'],
      PRESET_PATTERNS['silent-observer']
    ]
  }
}
