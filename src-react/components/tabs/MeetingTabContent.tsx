import { useEffect, useCallback } from 'react'
import { useTabsStore } from '@/stores/tabsStore'
import { useCallStore } from '@/stores/callStore'
import { useCallAnalytics } from '@/hooks/useCallAnalytics'
// import { ConnectionBadge } from '@/components/layout/ConnectionBadge' // Unused
import { ConnectingStage } from '@/components/stages/ConnectingStage'
import { MeetingStage } from '@/components/stages/MeetingStage'
import { SummaryStage } from '@/components/stages/SummaryStage'
import type { MeetingSummaryData } from '@/types'

interface MeetingTabContentProps {
  tabId: string
}

export function MeetingTabContent({ tabId }: MeetingTabContentProps) {
  const getMeetingTab = useTabsStore((state) => state.getMeetingTab)
  const updateMeetingTab = useTabsStore((state) => state.updateMeetingTab)
  const setMeetingStage = useTabsStore((state) => state.setMeetingStage)
  const closeMeetingTab = useTabsStore((state) => state.closeMeetingTab)
  
  const { getStats, getAnalytics, getCaptions, getTopQuestions } = useCallAnalytics()
  
  const tab = getMeetingTab(tabId)
  const connectionStatus = useCallStore((state) => state.connectionStatus)
  const isInCall = useCallStore((state) => state.isInCall)

  // Generate a default title if none exists
  useEffect(() => {
    if (!tab) return
    if (!tab.title?.trim()) {
      const fallback = `Meeting ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      updateMeetingTab(tabId, { title: fallback })
    }
  }, [tab, tabId, updateMeetingTab])

  // Sync connection status to tab stage
  useEffect(() => {
    if (!tab) return

    // When connected to meeting, move to meeting stage
    if (connectionStatus === 'connected' && tab.stage === 'connect') {
      setMeetingStage(tabId, 'meeting')
      updateMeetingTab(tabId, { isActive: true })
    }

    // When disconnected from meeting stage, move to summary
    if (connectionStatus === 'disconnected' && tab.stage === 'meeting' && !isInCall) {
      setMeetingStage(tabId, 'summary')
      updateMeetingTab(tabId, { isActive: false })
    }
  }, [connectionStatus, isInCall, tab, tabId, setMeetingStage, updateMeetingTab])

  // Handle returning to connect stage (rejoin)
  const handleRejoin = useCallback(() => {
    setMeetingStage(tabId, 'connect')
  }, [tabId, setMeetingStage])

  // Handle closing with summary data
  const handleClose = useCallback(async () => {
    // Gather analytics data before closing
    try {
      const stats = getStats()
      const captions = getCaptions()
      const questions = getTopQuestions(20) // Get more questions for history
      
      // Try to get AI summary (may not be available)
      let aiSummary: string | null = null
      try {
        const analytics = await getAnalytics()
        aiSummary = analytics.summary || null
      } catch {
        // AI summary not available, continue without it
      }
      
      // Build summary data to persist
      const summaryData: MeetingSummaryData = {
        transcript: captions.map(c => ({
          speaker: c.speaker,
          text: c.text,
          timestamp: c.timestamp
        })),
        questions: questions.map((q, i) => ({
          id: `q-${i}`,
          speaker: q.speaker,
          text: q.text,
          timestamp: new Date(),
          responseTime: q.responseTime ? parseFloat(q.responseTime) : null
        })),
        participants: [...new Set(captions.map(c => c.speaker))],
        aiSummary,
        stats: {
          totalDuration: stats.totalDuration,
          totalCaptions: stats.totalCaptions,
          totalQuestions: stats.totalQuestions,
          totalResponses: stats.totalResponses,
          averageResponseTime: stats.averageResponseTime
        }
      }
      
      // Close with summary data
      closeMeetingTab({ tabId, summaryData })
    } catch (error) {
      console.error('Failed to gather analytics for close:', error)
      // Close without summary data as fallback
      closeMeetingTab(tabId)
    }
  }, [tabId, closeMeetingTab, getStats, getCaptions, getTopQuestions, getAnalytics])

  if (!tab) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Meeting not found</p>
      </div>
    )
  }

  // Render stage content
  const renderStage = () => {
    switch (tab.stage) {
      case 'connect':
        return <ConnectingStage />
      case 'meeting':
        return <MeetingStage />
      case 'summary':
        return (
          <SummaryStage 
            onRejoin={handleRejoin}
            onClose={handleClose}
          />
        )
      default:
        return <ConnectingStage />
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Stage Content - full height, no redundant header */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderStage()}
      </div>
    </div>
  )
}

export default MeetingTabContent
