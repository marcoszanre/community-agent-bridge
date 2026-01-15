import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Tab, MeetingTab, MeetingInfo, MeetingSummaryData, AppStage, ConversationMessage } from '@/types'

interface CreateMeetingTabOptions {
  meetingUrl: string
  meetingTitle?: string
  agentName?: string
  activeProviderId?: string | null
}

interface CloseMeetingTabOptions {
  tabId: string
  summaryData?: MeetingSummaryData
}

interface TabsState {
  // All tabs
  tabs: Tab[]
  
  // Currently active tab ID
  activeTabId: string
  
  // History of meetings (for reopening from home)
  meetingHistory: MeetingInfo[]
  
  // Actions
  setActiveTab: (tabId: string) => void
  
  // Meeting tab management
  createMeetingTab: (options: CreateMeetingTabOptions) => string
  closeMeetingTab: (tabIdOrOptions: string | CloseMeetingTabOptions) => void
  updateMeetingTab: (tabId: string, updates: Partial<Omit<MeetingTab, 'id' | 'type'>>) => void
  setMeetingStage: (tabId: string, stage: AppStage) => void
  setMeetingAgent: (tabId: string, agentName: string, activeProviderId: string | null) => void
  getMeetingTab: (tabId: string) => MeetingTab | undefined
  getMeetingFromHistory: (meetingId: string) => MeetingInfo | undefined
  
  // Reopen meeting from history
  reopenMeeting: (meetingId: string, agentName?: string, activeProviderId?: string | null) => string | null
  
  // Meeting history management
  addToHistory: (meeting: MeetingInfo) => void
  clearHistory: () => void
  
  // Find existing tab for a meeting URL
  findMeetingTabByUrl: (meetingUrl: string) => MeetingTab | undefined
  findMeetingTabBySignature: (meetingUrl: string, agentName?: string | null, activeProviderId?: string | null) => MeetingTab | undefined
  
  // Conversation management for meeting tabs
  setTabConversationId: (tabId: string, conversationId: string | null) => void
  addTabMessage: (tabId: string, message: Omit<ConversationMessage, 'id'>) => void
  clearTabMessages: (tabId: string) => void
}

const HOME_TAB_ID = 'home'

const createHomeTab = (): Tab => ({
  id: HOME_TAB_ID,
  type: 'home',
  title: 'Home',
  createdAt: new Date()
})

export const useTabsStore = create<TabsState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state - only home tab
        tabs: [createHomeTab()],
        activeTabId: HOME_TAB_ID,
        meetingHistory: [],

        // Set active tab
        setActiveTab: (tabId) => {
          const tab = get().tabs.find(t => t.id === tabId)
          if (tab) {
            set({ activeTabId: tabId }, false, 'setActiveTab')
          }
        },

        // Create a new meeting tab
        createMeetingTab: (options) => {
          const { meetingUrl, meetingTitle, agentName, activeProviderId } = options

          const normalize = (val?: string | null) => (val || '').trim().toLowerCase()

          // If the same meeting + agent + provider is already open, focus it instead of creating a duplicate
          const existing = get().tabs.find((t) => {
            if (t.type !== 'meeting') return false
            const mt = t as MeetingTab
            return (
              normalize(mt.meetingUrl) === normalize(meetingUrl) &&
              normalize(mt.agentName) === normalize(agentName || 'AI Assistant') &&
              (mt.activeProviderId || null) === (activeProviderId ?? null)
            )
          }) as MeetingTab | undefined

          if (existing) {
            set({ activeTabId: existing.id }, false, 'reuseMeetingTab')
            return existing.id
          }

          // Otherwise create a fresh tab (allows parallel sessions for the same meeting with different agents)
          const tabId = crypto.randomUUID()
          const newTab: MeetingTab = {
            id: tabId,
            type: 'meeting',
            title: meetingTitle || 'Meeting',
            meetingUrl,
            meetingTitle,
            createdAt: new Date(),
            joinedAt: new Date(),
            isActive: true,
            stage: 'connect',
            agentName: agentName || 'AI Assistant',
            activeProviderId: activeProviderId ?? null,
            conversationId: null,
            conversationMessages: []
          }

          set(
            (state) => ({
              tabs: [...state.tabs, newTab],
              activeTabId: tabId
            }),
            false,
            'createMeetingTab'
          )

          return tabId
        },

        // Close a meeting tab
        closeMeetingTab: (tabIdOrOptions) => {
          // Support both old API (string) and new API (options object)
          const isOptionsObject = typeof tabIdOrOptions === 'object'
          const tabId = isOptionsObject ? tabIdOrOptions.tabId : tabIdOrOptions
          const summaryData = isOptionsObject ? tabIdOrOptions.summaryData : undefined
          
          const state = get()
          const tab = state.tabs.find(t => t.id === tabId) as MeetingTab | undefined
          
          if (!tab || tab.type !== 'meeting') return

          // Add to history before closing (with summary data if provided)
          const meetingInfo: MeetingInfo = {
            id: tab.id,
            title: tab.title,
            meetingUrl: tab.meetingUrl,
            joinedAt: tab.joinedAt,
            leftAt: new Date(),
            duration: Math.floor((Date.now() - tab.joinedAt.getTime()) / 1000),
            participantCount: summaryData?.participants.length,
            captionCount: summaryData?.stats.totalCaptions,
            summary: summaryData
          }

          set(
            (state) => {
              const newTabs = state.tabs.filter(t => t.id !== tabId)
              const newActiveTabId = state.activeTabId === tabId ? HOME_TAB_ID : state.activeTabId
              
              return {
                tabs: newTabs,
                activeTabId: newActiveTabId,
                meetingHistory: [meetingInfo, ...state.meetingHistory].slice(0, 20) // Keep last 20
              }
            },
            false,
            'closeMeetingTab'
          )
        },

        // Update meeting tab properties
        updateMeetingTab: (tabId, updates) => {
          set(
            (state) => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId && tab.type === 'meeting'
                  ? { ...tab, ...updates }
                  : tab
              )
            }),
            false,
            'updateMeetingTab'
          )
        },

        // Set meeting stage
        setMeetingStage: (tabId, stage) => {
          set(
            (state) => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId && tab.type === 'meeting'
                  ? { ...tab, stage }
                  : tab
              )
            }),
            false,
            'setMeetingStage'
          )
        },

        // Set meeting agent configuration
        setMeetingAgent: (tabId, agentName, activeProviderId) => {
          set(
            (state) => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId && tab.type === 'meeting'
                  ? { ...tab, agentName, activeProviderId }
                  : tab
              )
            }),
            false,
            'setMeetingAgent'
          )
        },

        // Get meeting tab by ID
        getMeetingTab: (tabId) => {
          const tab = get().tabs.find(t => t.id === tabId)
          return tab?.type === 'meeting' ? tab as MeetingTab : undefined
        },
        
        // Get meeting from history by ID
        getMeetingFromHistory: (meetingId) => {
          return get().meetingHistory.find(m => m.id === meetingId)
        },

        // Reopen a meeting from history
        reopenMeeting: (meetingId, agentName, activeProviderId) => {
          const meeting = get().meetingHistory.find(m => m.id === meetingId)
          if (!meeting) return null

          // Check if the same meeting+agent+provider is already open
          const existing = get().findMeetingTabBySignature(
            meeting.meetingUrl,
            agentName,
            activeProviderId ?? null
          )
          if (existing) {
            console.log(`📋 Reopening tab, already open for this agent: "${existing.agentName}"`)
            set(
              () => ({ activeTabId: existing.id }),
              false,
              'activateReopenedMeeting'
            )
            return existing.id
          }

          // Create new tab
          return get().createMeetingTab({
            meetingUrl: meeting.meetingUrl,
            meetingTitle: meeting.title,
            agentName,
            activeProviderId
          })
        },

        // Add meeting to history
        addToHistory: (meeting) => {
          set(
            (state) => ({
              meetingHistory: [meeting, ...state.meetingHistory.filter(m => m.id !== meeting.id)].slice(0, 20)
            }),
            false,
            'addToHistory'
          )
        },

        // Clear meeting history
        clearHistory: () => {
          set({ meetingHistory: [] }, false, 'clearHistory')
        },

        // Find tab by meeting URL (first match)
        findMeetingTabByUrl: (meetingUrl) => {
          return get().tabs.find(
            t => t.type === 'meeting' && (t as MeetingTab).meetingUrl === meetingUrl
          ) as MeetingTab | undefined
        },

        // Find tab by meeting URL + agent + provider signature
        findMeetingTabBySignature: (meetingUrl, agentName, activeProviderId) => {
          const normalize = (val?: string | null) => (val || '').trim().toLowerCase()
          const targetUrl = normalize(meetingUrl)
          const targetAgent = normalize(agentName)
          const targetProvider = activeProviderId ?? null

          return get().tabs.find((t) => {
            if (t.type !== 'meeting') return false
            const mt = t as MeetingTab
            return (
              normalize(mt.meetingUrl) === targetUrl &&
              normalize(mt.agentName) === targetAgent &&
              (mt.activeProviderId || null) === targetProvider
            )
          }) as MeetingTab | undefined
        },

        // Set conversation ID for a meeting tab
        setTabConversationId: (tabId, conversationId) => {
          set(
            (state) => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId && tab.type === 'meeting'
                  ? { ...tab, conversationId } as MeetingTab
                  : tab
              )
            }),
            false,
            'setTabConversationId'
          )
        },

        // Add a message to a meeting tab's conversation
        addTabMessage: (tabId, message) => {
          const fullMessage: ConversationMessage = {
            ...message,
            id: crypto.randomUUID()
          }
          set(
            (state) => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId && tab.type === 'meeting'
                  ? { 
                      ...tab, 
                      conversationMessages: [...(tab as MeetingTab).conversationMessages, fullMessage] 
                    } as MeetingTab
                  : tab
              )
            }),
            false,
            'addTabMessage'
          )
        },

        // Clear messages for a meeting tab
        clearTabMessages: (tabId) => {
          set(
            (state) => ({
              tabs: state.tabs.map(tab =>
                tab.id === tabId && tab.type === 'meeting'
                  ? { ...tab, conversationMessages: [], conversationId: null } as MeetingTab
                  : tab
              )
            }),
            false,
            'clearTabMessages'
          )
        }
      }),
      {
        name: 'tabs-store',
        partialize: (state) => ({
          meetingHistory: state.meetingHistory
        })
      }
    ),
    { name: 'tabs-store' }
  )
)

// Selector for active tab
export const selectActiveTab = (state: TabsState) => 
  state.tabs.find(t => t.id === state.activeTabId)

// Selector for meeting tabs only
export const selectMeetingTabs = (state: TabsState) =>
  state.tabs.filter(t => t.type === 'meeting') as MeetingTab[]
