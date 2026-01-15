// ============================================
// Agent Behavior Store
// Manages behavior patterns, pending responses queue, and hand state
// ============================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { 
  AgentBehaviorPattern, 
  TriggerSource,
  PendingResponse, 
  PendingResponseStatus,
  QueueStats,
  BehaviorEvent,
  BehaviorEventCallback,
  ResponseChannel
} from '@/types'
import { PRESET_PATTERNS, DEFAULT_PATTERN_ID } from './presetPatterns'

// Maximum number of responses to keep in queue
const MAX_QUEUE_SIZE = 20

// How long to keep completed responses in history (ms)
const HISTORY_RETENTION_MS = 30 * 60 * 1000 // 30 minutes

interface AgentBehaviorState {
  // Current pattern configuration
  currentPatternId: string
  patterns: Record<string, AgentBehaviorPattern>
  
  // Pending responses queue
  pendingResponses: PendingResponse[]
  
  // Hand state (synced with meeting provider)
  isHandRaised: boolean
  
  // Event listeners
  _eventListeners: Set<BehaviorEventCallback>
  
  // Computed
  getCurrentPattern: () => AgentBehaviorPattern
  getQueueStats: () => QueueStats
  getPendingByStatus: (status: PendingResponseStatus) => PendingResponse[]
  getNextPendingForHand: () => PendingResponse | null
  
  // Actions - Pattern Management
  setCurrentPattern: (patternId: string) => void
  updatePattern: (pattern: AgentBehaviorPattern) => void
  createCustomPattern: (basedOn: string, name: string) => AgentBehaviorPattern
  deletePattern: (patternId: string) => void
  resetToPresets: () => void
  
  // Actions - Pending Responses
  addPendingResponse: (params: {
    triggerSource: TriggerSource
    triggerContent: string
    triggerAuthor: string
    responseText: string
    responseChannel: ResponseChannel
  }) => PendingResponse
  
  updateResponseStatus: (id: string, status: PendingResponseStatus, errorMessage?: string) => void
  approveResponse: (id: string) => void
  rejectResponse: (id: string) => void
  dismissResponse: (id: string) => void
  clearCompletedResponses: () => void
  
  // Actions - Hand State
  setHandRaised: (raised: boolean) => void
  
  // Actions - Events
  addEventListener: (callback: BehaviorEventCallback) => () => void
  _emitEvent: (event: BehaviorEvent) => void
}

export const useAgentBehaviorStore = create<AgentBehaviorState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentPatternId: DEFAULT_PATTERN_ID,
      patterns: { ...PRESET_PATTERNS },
      pendingResponses: [],
      isHandRaised: false,
      _eventListeners: new Set(),
      
      // Computed
      getCurrentPattern: () => {
        const state = get()
        return state.patterns[state.currentPatternId] || PRESET_PATTERNS[DEFAULT_PATTERN_ID]
      },
      
      getQueueStats: () => {
        const responses = get().pendingResponses
        return {
          total: responses.length,
          pending: responses.filter(r => r.status === 'pending').length,
          approved: responses.filter(r => r.status === 'approved').length,
          rejected: responses.filter(r => r.status === 'rejected').length,
          sent: responses.filter(r => r.status === 'sent').length,
          failed: responses.filter(r => r.status === 'failed').length,
        }
      },
      
      getPendingByStatus: (status) => {
        return get().pendingResponses.filter(r => r.status === status)
      },
      
      getNextPendingForHand: () => {
        // Get the oldest pending response that's waiting for hand acknowledgment
        return get().pendingResponses.find(
          r => r.status === 'hand-raised' && r.behaviorMode === 'queued'
        ) || null
      },
      
      // Pattern Management
      setCurrentPattern: (patternId) => {
        const state = get()
        if (state.patterns[patternId]) {
          set({ currentPatternId: patternId })
        }
      },
      
      updatePattern: (pattern) => {
        set(state => ({
          patterns: {
            ...state.patterns,
            [pattern.id]: pattern
          }
        }))
      },
      
      createCustomPattern: (basedOn, name) => {
        const state = get()
        const basePattern = state.patterns[basedOn] || PRESET_PATTERNS[DEFAULT_PATTERN_ID]
        
        const newPattern: AgentBehaviorPattern = {
          ...basePattern,
          id: `custom-${Date.now()}`,
          name,
          description: `Custom pattern based on ${basePattern.name}`,
          isPreset: false
        }
        
        set(state => ({
          patterns: {
            ...state.patterns,
            [newPattern.id]: newPattern
          }
        }))
        
        return newPattern
      },
      
      deletePattern: (patternId) => {
        const state = get()
        const pattern = state.patterns[patternId]
        
        // Can't delete presets
        if (!pattern || pattern.isPreset) return
        
        const { [patternId]: _, ...remainingPatterns } = state.patterns
        
        set({
          patterns: remainingPatterns,
          // Reset to default if deleting current
          currentPatternId: state.currentPatternId === patternId 
            ? DEFAULT_PATTERN_ID 
            : state.currentPatternId
        })
      },
      
      resetToPresets: () => {
        set({
          patterns: { ...PRESET_PATTERNS },
          currentPatternId: DEFAULT_PATTERN_ID
        })
      },
      
      // Pending Responses
      addPendingResponse: (params) => {
        const state = get()
        const pattern = state.getCurrentPattern()
        const triggerConfig = params.triggerSource === 'caption-mention' 
          ? pattern.captionMention 
          : pattern.chatMention
        
        const pendingResponse: PendingResponse = {
          id: `pr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date(),
          triggerSource: params.triggerSource,
          triggerContent: params.triggerContent,
          triggerAuthor: params.triggerAuthor,
          responseText: params.responseText,
          responseChannel: params.responseChannel,
          status: 'pending',
          behaviorMode: triggerConfig.behaviorMode,
          statusChangedAt: new Date()
        }
        
        // Trim queue if too large (remove oldest completed)
        let responses = [...state.pendingResponses, pendingResponse]
        if (responses.length > MAX_QUEUE_SIZE) {
          const completedStatuses: PendingResponseStatus[] = ['sent', 'failed', 'rejected', 'dismissed']
          const oldestCompleted = responses.find(r => completedStatuses.includes(r.status))
          if (oldestCompleted) {
            responses = responses.filter(r => r.id !== oldestCompleted.id)
          }
        }
        
        set({ pendingResponses: responses })
        
        get()._emitEvent({ 
          type: 'response-queued', 
          pendingId: pendingResponse.id, 
          mode: triggerConfig.behaviorMode 
        })
        
        return pendingResponse
      },
      
      updateResponseStatus: (id, status, errorMessage) => {
        set(state => ({
          pendingResponses: state.pendingResponses.map(r => 
            r.id === id 
              ? { ...r, status, statusChangedAt: new Date(), errorMessage }
              : r
          )
        }))
      },
      
      approveResponse: (id) => {
        get().updateResponseStatus(id, 'approved')
        get()._emitEvent({ type: 'response-approved', pendingId: id })
      },
      
      rejectResponse: (id) => {
        get().updateResponseStatus(id, 'rejected')
        get()._emitEvent({ type: 'response-rejected', pendingId: id })
      },
      
      dismissResponse: (id) => {
        get().updateResponseStatus(id, 'dismissed')
      },
      
      clearCompletedResponses: () => {
        const now = Date.now()
        const completedStatuses: PendingResponseStatus[] = ['sent', 'failed', 'rejected', 'dismissed']
        
        set(state => ({
          pendingResponses: state.pendingResponses.filter(r => {
            if (!completedStatuses.includes(r.status)) return true
            // Keep recent completed responses
            const age = now - r.statusChangedAt.getTime()
            return age < HISTORY_RETENTION_MS
          })
        }))
      },
      
      // Hand State
      setHandRaised: (raised) => {
        const wasRaised = get().isHandRaised
        set({ isHandRaised: raised })
        
        // If hand was lowered, emit event
        if (wasRaised && !raised) {
          const nextPending = get().getNextPendingForHand()
          get()._emitEvent({ 
            type: 'hand-lowered', 
            pendingId: nextPending?.id 
          })
        }
      },
      
      // Events
      addEventListener: (callback) => {
        get()._eventListeners.add(callback)
        return () => {
          get()._eventListeners.delete(callback)
        }
      },
      
      _emitEvent: (event) => {
        get()._eventListeners.forEach(listener => {
          try {
            listener(event)
          } catch (e) {
            console.error('Error in behavior event listener:', e)
          }
        })
      }
    }),
    {
      name: 'agent-behavior-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentPatternId: state.currentPatternId,
        patterns: state.patterns
        // Don't persist pendingResponses or runtime state
      })
    }
  )
)

// Selectors for common use cases
export const selectCurrentPattern = (state: AgentBehaviorState) => state.getCurrentPattern()
export const selectPendingCount = (state: AgentBehaviorState) => 
  state.pendingResponses.filter(r => r.status === 'pending').length
export const selectIsHandRaised = (state: AgentBehaviorState) => state.isHandRaised
