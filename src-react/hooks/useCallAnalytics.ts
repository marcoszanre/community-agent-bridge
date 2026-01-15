// useCallAnalytics - React hook for call analytics

import { useCallback } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { useAppStore } from '@/stores/appStore'
import { getCallAnalyticsService, type CallAnalytics } from '@/services'

export function useCallAnalytics() {
  const analyticsService = getCallAnalyticsService()
  const { config } = useConfigStore()
  const { addLog } = useAppStore()

  // Initialize analytics with OpenAI for AI summaries
  const initialize = useCallback(() => {
    if (config.openai?.endpoint && config.openai?.apiKey && config.openai?.deployment) {
      analyticsService.initialize({
        openaiEndpoint: config.openai.endpoint,
        openaiApiKey: config.openai.apiKey,
        openaiDeployment: config.openai.deployment
      })
      addLog('Call analytics initialized with AI', 'info')
      return true
    } else {
      addLog('Call analytics initialized (basic mode)', 'info')
      return false
    }
  }, [config.openai, addLog])

  // Get full analytics with summary
  const getAnalytics = useCallback(async (): Promise<CallAnalytics> => {
    try {
      return await analyticsService.getAnalytics()
    } catch (error) {
      addLog(`Failed to generate analytics: ${error}`, 'error')
      throw error
    }
  }, [addLog])

  // Get quick stats (synchronous)
  const getStats = useCallback(() => {
    return analyticsService.getStats()
  }, [])

  // Get transcript
  const getTranscript = useCallback(() => {
    return analyticsService.getTranscript()
  }, [])

  // Get raw captions
  const getCaptions = useCallback(() => {
    return analyticsService.getCaptions()
  }, [])

  // Get top questions
  const getTopQuestions = useCallback((limit = 5) => {
    return analyticsService.getTopQuestions(limit)
  }, [])

  // Get formatted duration
  const getFormattedDuration = useCallback(() => {
    return analyticsService.getFormattedDuration()
  }, [])

  // Reset analytics
  const reset = useCallback(() => {
    analyticsService.reset()
    addLog('Analytics reset', 'info')
  }, [addLog])

  return {
    initialize,
    getAnalytics,
    getStats,
    getTranscript,
    getCaptions,
    getTopQuestions,
    getFormattedDuration,
    reset
  }
}
