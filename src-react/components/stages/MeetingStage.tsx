import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useCallStore } from '@/stores/callStore'
import { useAgentStore } from '@/stores/agentStore'
import { useConfigStore } from '@/stores/configStore'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { useTabsStore, selectActiveTab } from '@/stores/tabsStore'
import { useAgentBehaviorStore } from '@/stores/agentBehaviorStore'
import { useAcsCall } from '@/hooks/useAcsCall'
import { useMeetingAgent, type MeetingAgentConfig } from '@/hooks/useMeetingAgent'
import { useTextToSpeech } from '@/hooks/useTextToSpeech'
import { useMeetingChat } from '@/hooks/useMeetingChat'
import { useCallAnalytics } from '@/hooks/useCallAnalytics'
import { getIntentDetectionService, getCaptionAggregationService, getCallAnalyticsService } from '@/services'
import type { AggregatedCaption, MentionResult, PendingMention } from '@/services/captionAggregationService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ParticleSpherePreview } from '@/components/ui/ParticleSpherePreview'
import { cn, extractMessageText } from '@/lib/utils'
import { 
  PhoneOff, Volume2, Square, 
  Bot, RefreshCw, Video, Settings, Send, MessageSquare, X,
  Check, XCircle, Zap, Hand, Shield, ChevronDown, ChevronUp, Bug, Search
} from 'lucide-react'
import { AZURE_VOICES, type MeetingTab } from '@/types'
import ReactMarkdown from 'react-markdown'

declare global {
  interface Window {
    agentVideoPreviewStream?: MediaStream
    agentVideoPreviewCanvas?: HTMLCanvasElement
    setAgentSpeaking?: (speaking: boolean) => void
  }
}

// Pending approval item type
interface PendingApproval {
  id: string
  responseText: string
  channel: 'speech' | 'chat' | 'both'
  triggerContent: string
  triggerAuthor: string
  createdAt: Date
}

/**
 * Detects if a response text is an error message that should not be spoken aloud.
 * Error messages should only be displayed in the agent conversation panel.
 */
function isErrorResponse(text: string): boolean {
  if (!text) return false
  const lowerText = text.toLowerCase()
  
  // Common error patterns from AI services
  const errorPatterns = [
    'an error has occurred',
    'error code:',
    'error:',
    'contentfiltered',
    'content filtered',
    'conversation id:',
    'time (utc):',
    'failed to',
    'exception:',
    'internal server error',
    'rate limit',
    'throttled',
    'timeout',
    'service unavailable',
    'bad request',
    'unauthorized',
    'forbidden',
    'not found'
  ]
  
  return errorPatterns.some(pattern => lowerText.includes(pattern))
}

export function MeetingStage() {
  const setStage = useAppStore((state) => state.setStage)
  const { isLogsExpanded, toggleLogs, addLog, logs, clearLogs } = useAppStore()
  const { config, setSpeechConfig, setCopilotStudioConfig } = useConfigStore()
  const getProvider = useAgentProvidersStore((state) => state.getProvider)
  
  // Get current meeting tab for agent configuration
  const activeTab = useTabsStore(selectActiveTab)
  const meetingTab = activeTab?.type === 'meeting' ? activeTab as MeetingTab : null
  const activeProvider = meetingTab?.activeProviderId ? getProvider(meetingTab.activeProviderId) : undefined
  
  // Use agent name from meeting tab, fallback to store displayName
  const meetingAgentName = meetingTab?.agentName

  // Tab conversation helpers (needed before effects use them)
  const { setTabConversationId, clearTabMessages, setMeetingAgent, addTabMessage } = useTabsStore()
  
  const { 
    speechState, setSpeechState,
    captions,
    connectionStatus,
    welcomeMessageSent,
    setWelcomeMessageSent
  } = useCallStore()
  
  const { 
    auth, conversation, session,
    displayName,
    startSession, endSession,
    addMessage: addAgentMessage,
    clearMessages,
    setConversationId: setAgentConversationId
  } = useAgentStore()
  
  // Track recently added messages to prevent duplicates (keyed by content hash)
  const recentMessagesRef = useRef<Set<string>>(new Set())
  
  // Wrapper to add message to both agent store (in-memory) and tab store (persistence)
  // Includes deduplication to prevent duplicate welcome messages
  const addMessage = useCallback((message: Omit<import('@/types').ConversationMessage, 'id'>) => {
    // Create a simple hash of the message for deduplication
    // Use text + role + timestamp (rounded to nearest second) to identify duplicates
    const timestampSec = Math.floor(message.timestamp.getTime() / 1000)
    const messageKey = `${message.role}:${message.text}:${timestampSec}`
    
    // Check if we've seen this message recently (within ~2 seconds)
    if (recentMessagesRef.current.has(messageKey)) {
      console.log('🔄 Duplicate message detected, skipping:', message.text?.substring(0, 50))
      return
    }
    
    // Add to recent messages set (auto-clean after 2 seconds)
    recentMessagesRef.current.add(messageKey)
    setTimeout(() => {
      recentMessagesRef.current.delete(messageKey)
    }, 2000)
    
    addAgentMessage(message)
    if (meetingTab?.id) {
      addTabMessage(meetingTab.id, message)
    }
  }, [addAgentMessage, addTabMessage, meetingTab?.id])
  
  // Use tab messages if available (persisted), fallback to agent store messages
  const conversationMessages = meetingTab?.conversationMessages ?? conversation.messages
  
  // Get current behavior pattern
  const getCurrentPattern = useAgentBehaviorStore(state => state.getCurrentPattern)
  const currentPatternId = useAgentBehaviorStore(state => state.currentPatternId)
  const setCurrentPattern = useAgentBehaviorStore(state => state.setCurrentPattern)
  const currentPattern = getCurrentPattern()
  
  // Effective display name: meeting-specific > store default
  const effectiveDisplayName = meetingAgentName || displayName

  // Agent voice and type (align with home view)
  const agentVoiceName = activeProvider?.voiceName || config.speech.voiceName || 'en-US-JennyNeural'
  const agentVoiceLabel = useMemo(() => {
    const match = AZURE_VOICES.find(v => v.value === agentVoiceName)
    return match?.label || agentVoiceName || 'Voice not set'
  }, [agentVoiceName])

  // TTS hook (placed early to avoid temporal dead zone in effects)
  const { initialize: initTts, speak, stop: stopSpeaking, isSpeaking, isSynthesizing, setSpeechRate } = useTextToSpeech()

  const agentTypeLabel = useMemo(() => {
    if (!activeProvider) return 'Default'
    switch (activeProvider.type) {
      case 'copilot-studio': return 'Copilot Studio'
      case 'copilot-studio-anon': return 'Copilot Studio (Anon)'
      case 'azure-foundry': return 'Azure Foundry'
      case 'azure-openai': return 'Azure OpenAI'
      default: return 'Custom'
    }
  }, [activeProvider])

  const providerDisplayName = useMemo(() => {
    if (!activeProvider) return null
    if (activeProvider.type === 'copilot-studio' || activeProvider.type === 'copilot-studio-anon') {
      return activeProvider.settings.botName || activeProvider.name
    }
    if (activeProvider.type === 'azure-foundry') {
      return activeProvider.settings.displayName || activeProvider.settings.agentName || activeProvider.name
    }
    return activeProvider.name
  }, [activeProvider])

  // Auth requirements vary by provider; Copilot Studio requires Microsoft auth, others don't.
  const providerRequiresAuth = activeProvider?.type === 'copilot-studio'
  const canConnectAgent = providerRequiresAuth ? auth.isAuthenticated : true

  // Reset per-meeting transient guards so auto-connect/chat init runs for each meeting
  useEffect(() => {
    agentAutoStarted.current = false
    meetingChatInitialized.current = false
  }, [meetingTab?.id])

  // Build agent config based on active provider
  const agentConfig = useMemo((): MeetingAgentConfig | null => {
    if (!activeProvider) return null
    
    if (activeProvider.type === 'copilot-studio') {
      return {
        type: 'copilot-studio',
        clientId: activeProvider.settings.clientId,
        tenantId: activeProvider.settings.tenantId,
        environmentId: activeProvider.settings.environmentId,
        botId: activeProvider.settings.botId,
        botName: activeProvider.settings.botName || activeProvider.name
      }
    }
    
    if (activeProvider.type === 'copilot-studio-anon') {
      return {
        type: 'copilot-studio-anon',
        directLineSecret: activeProvider.settings.directLineSecret,
        botName: activeProvider.settings.botName || activeProvider.name
      }
    }
    
    if (activeProvider.type === 'azure-foundry') {
      return {
        type: 'azure-foundry',
        projectEndpoint: activeProvider.settings.projectEndpoint,
        agentName: activeProvider.settings.agentName,
        tenantId: activeProvider.settings.tenantId || '',
        clientId: activeProvider.settings.clientId || '',
        clientSecret: activeProvider.settings.clientSecret || '',
        region: activeProvider.settings.region,
        displayName: activeProvider.settings.displayName || activeProvider.settings.agentName || activeProvider.name
      }
    }
    
    return null
  }, [activeProvider])

  // Sync meeting agent name and speech voice to the selected provider
  useEffect(() => {
    if (!meetingTab || !activeProvider) return

    // Update meeting tab display name if provider supplies one
    if (providerDisplayName && providerDisplayName !== meetingAgentName) {
      setMeetingAgent(meetingTab.id, providerDisplayName, activeProvider.id)
    }

    // Align TTS voice with provider voice
    if (activeProvider.voiceName && config.speech.voiceName !== activeProvider.voiceName) {
      setSpeechConfig({ voiceName: activeProvider.voiceName })
      // Reinitialize TTS with new voice
      initTts({ force: true })
    }

    // Push provider Copilot settings so we don't fall back to defaults (only for copilot-studio type)
    if (agentConfig && agentConfig.type === 'copilot-studio') {
      const current = config.copilotStudio
      const next = {
        clientId: agentConfig.clientId || '',
        appClientId: agentConfig.clientId || '',
        tenantId: agentConfig.tenantId || '',
        environmentId: agentConfig.environmentId || '',
        botId: agentConfig.botId || '',
        agentIdentifier: agentConfig.botId || '',
        botName: agentConfig.botName || ''
      }

      const needsUpdate =
        current.clientId !== next.clientId ||
        current.appClientId !== next.appClientId ||
        current.tenantId !== next.tenantId ||
        current.environmentId !== next.environmentId ||
        current.botId !== next.botId ||
        current.agentIdentifier !== next.agentIdentifier ||
        current.botName !== next.botName

      if (needsUpdate) {
        setCopilotStudioConfig(next)
      }
    }
  }, [meetingTab, activeProvider, providerDisplayName, meetingAgentName, setMeetingAgent, config.speech.voiceName, setSpeechConfig, initTts, agentConfig, setCopilotStudioConfig, config.copilotStudio])
  
  // Clear conversation when agent provider changes (including first set)
  useEffect(() => {
    const currentProviderId = meetingTab?.activeProviderId || null

    const providerChanged = currentProviderId !== previousProviderIdRef.current && currentProviderId !== null

    if (providerChanged) {
      addLog('Agent changed - clearing conversation history', 'info')
      if (meetingTab) {
        clearTabMessages(meetingTab.id)
        setTabConversationId(meetingTab.id, null)
      }
      clearMessages()
      setAgentConversationId(null)
      endSession()
      setSentToMeetingIds(new Set())
      agentAutoStarted.current = false // Allow re-connection with new agent
    }

    previousProviderIdRef.current = currentProviderId
  }, [meetingTab?.activeProviderId, meetingTab, clearTabMessages, setTabConversationId, clearMessages, setAgentConversationId, endSession, addLog])
  
  // Panel state
  const [showTts, setShowTts] = useState(false)
  const [hasVideoPreview, setHasVideoPreview] = useState(false)
  const [showVideoPreview, setShowVideoPreview] = useState(false)
  const [showAgentConfig, setShowAgentConfig] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isSendingChat, setIsSendingChat] = useState(false)
  const [meetingChatInput, setMeetingChatInput] = useState('')
  const [isSendingMeetingChat, setIsSendingMeetingChat] = useState(false)
  
  // Pending approvals for supervised mode
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  
  // Search/filter state for messages
  const [searchQuery, setSearchQuery] = useState('')

  // Meeting chat hook (used by multiple filters and handlers)
  const meetingChat = useMeetingChat()
  
  // Filtered messages based on search query
  const filteredCaptions = useMemo(() => {
    if (!searchQuery.trim()) return captions
    const query = searchQuery.toLowerCase()
    return captions.filter(c => 
      c.text.toLowerCase().includes(query) || 
      c.speaker.toLowerCase().includes(query)
    )
  }, [captions, searchQuery])
  
  const filteredMeetingChatMessages = useMemo(() => {
    if (!searchQuery.trim()) return meetingChat.messages
    const query = searchQuery.toLowerCase()
    return meetingChat.messages.filter(m => 
      m.content.toLowerCase().includes(query) || 
      m.senderDisplayName.toLowerCase().includes(query)
    )
  }, [meetingChat.messages, searchQuery])
  
  const filteredAgentMessages = useMemo(() => {
    if (!searchQuery.trim()) return conversationMessages
    const query = searchQuery.toLowerCase()
    return conversationMessages.filter(m => 
      m.text?.toLowerCase().includes(query)
    )
  }, [conversationMessages, searchQuery])
  
  // Real hooks
  const { leaveCall, sendThumbsUp, raiseHand, onHandLowered, getChatThreadId, onChatThreadReady } = useAcsCall()
  const meetingAgent = useMeetingAgent({ onMessageReceived: addMessage })
  const { isConnected: isAgentConnected, isConnecting: isAgentConnecting, conversationId, connect: connectAgent, sendMessage: sendAgentMessage } = meetingAgent
  
  // Call analytics
  const { initialize: initAnalytics } = useCallAnalytics()
  const analyticsService = getCallAnalyticsService()
  const analyticsInitialized = useRef(false)
  
  // Queued response state (for polite/raise hand mode)
  const queuedResponseRef = useRef<{ text: string, channel: 'speech' | 'chat' | 'both' } | null>(null)
  
  const [ttsText, setTtsText] = useState('')
  const [speechRateLocal, setSpeechRateLocal] = useState(1.0)
  const ttsInitialized = useRef(false)
  const agentAutoStarted = useRef(false)
  const lastProcessedCaptionId = useRef<string | null>(null)
  const sessionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sessionRef = useRef(session)
  const isSpeakingRef = useRef(false)
  const intentServiceInitialized = useRef(false)
  const captionAggregationInitialized = useRef(false)
  const captionHistoryRef = useRef<Array<{ speaker: string; text: string }>>([])
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  const meetingChatEndRef = useRef<HTMLDivElement | null>(null)
  const captionsEndRef = useRef<HTMLDivElement | null>(null)
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)
  const meetingChatInitialized = useRef(false)
  const isProcessingRef = useRef(false) // Lock to prevent duplicate processing
  const previousProviderIdRef = useRef<string | null>(null)
  const previousTabIdRef = useRef<string | null>(null)
  const previousMeetingUrlRef = useRef<string | null>(null)
  const [sentToMeetingIds, setSentToMeetingIds] = useState<Set<string>>(new Set()) // Track which messages have been sent to meeting
  
  // Clear agent conversation when joining a new tab or the meeting URL changes
  // (keeps state when simply toggling between Home and the same meeting tab)
  useEffect(() => {
    if (!meetingTab) return

    const currentTabId = meetingTab.id
    const currentUrl = meetingTab.meetingUrl
    const isFirstMount = previousTabIdRef.current === null && previousMeetingUrlRef.current === null
    const isNewTab = previousTabIdRef.current !== null && previousTabIdRef.current !== currentTabId
    const isUrlChange = previousMeetingUrlRef.current !== null && previousMeetingUrlRef.current !== currentUrl

    if (isFirstMount || isNewTab || isUrlChange) {
      addLog('Resetting agent conversation for new meeting context', 'info')
      clearMessages()
      setAgentConversationId(null)
      endSession()
      setSentToMeetingIds(new Set())
      clearTabMessages(currentTabId)
      setTabConversationId(currentTabId, null)
      agentAutoStarted.current = false
      
      // Reset speech rate to default (1.0x) for new meetings
      setSpeechRateLocal(1.0)
      setSpeechRate(1.0)
    }
    
    // Update refs for next comparison
    previousTabIdRef.current = currentTabId
    previousMeetingUrlRef.current = currentUrl
  }, [meetingTab?.id, meetingTab?.meetingUrl, clearMessages, setAgentConversationId, endSession, addLog, clearTabMessages, setTabConversationId, setSpeechRate])

  // Helper to get context for agent messages
  const getMessageContext = useCallback(() => {
    return {
      captions: captions.map(c => ({ speaker: c.speaker, text: c.text })),
      chatMessages: meetingChat.messages.map(m => ({ sender: m.senderDisplayName, text: m.content }))
    }
  }, [captions, meetingChat.messages])
  
  // Keep session ref updated
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Keep speaking ref updated
  useEffect(() => {
    isSpeakingRef.current = isSpeaking || isSynthesizing
  }, [isSpeaking, isSynthesizing])

  // Auto-start agent when entering meeting (if authenticated or no auth required)
  useEffect(() => {
    if (agentAutoStarted.current) return
    if (!canConnectAgent) return
    if (!agentConfig) return
    if (isAgentConnected) return
    if (isAgentConnecting) return
    if (conversationId) return
    
    agentAutoStarted.current = true
    
    addLog(`Auto-starting ${agentConfig.type} agent...`, 'info')
    
    connectAgent(agentConfig).then(async (result) => {
      if (result.success) {
        if (meetingTab && result.conversationId) {
          setTabConversationId(meetingTab.id, result.conversationId)
        }
        addLog('✓ AI Agent ready', 'success')
      } else {
        agentAutoStarted.current = false
      }
    }).catch((err) => {
      addLog(`Failed to auto-start agent: ${err}`, 'error')
      agentAutoStarted.current = false
    })
  }, [canConnectAgent, connectAgent, addLog, meetingTab, setTabConversationId, agentConfig, isAgentConnected, isAgentConnecting, conversationId])

  // Failsafe: if agent not connected shortly after meeting/chat ready, retry connect automatically
  useEffect(() => {
    if (!canConnectAgent) return
    if (!agentConfig) return
    if (isAgentConnected) return
    const retryTimeout = setTimeout(() => {
      if (agentAutoStarted.current) return
      agentAutoStarted.current = true
      addLog('Retrying agent connect...', 'info')
      connectAgent(agentConfig).then(async (result) => {
        if (result.success && meetingTab && result.conversationId) {
          setTabConversationId(meetingTab.id, result.conversationId)
        }
      }).catch((err) => {
        addLog(`Agent retry failed: ${err}`, 'error')
        agentAutoStarted.current = false
      })
    }, 4000)
    return () => clearTimeout(retryTimeout)
  }, [canConnectAgent, isAgentConnected, meetingTab, connectAgent, addLog, agentConfig, setTabConversationId])

  // Send welcome message when both agent and meeting chat are connected
  useEffect(() => {
    // Debug log to help diagnose welcome message issues
    console.log('Welcome message check:', { 
      welcomeMessageSent, 
      isAgentConnected, 
      meetingChatConnected: meetingChat.isConnected, 
      connectionStatus 
    })
    
    if (welcomeMessageSent) {
      console.log('Welcome message already sent, skipping')
      return
    }
    if (!isAgentConnected) {
      console.log('Agent not connected, skipping welcome message')
      return
    }
    if (!meetingChat.isConnected) {
      console.log('Meeting chat not connected, skipping welcome message')
      return
    }
    // Don't send welcome if we're disconnecting or not in meeting
    if (connectionStatus !== 'connected') {
      console.log('Not in connected state, skipping welcome message')
      return
    }
    
    console.log('All conditions met, sending welcome message!')
    setWelcomeMessageSent(true)
    
    const sendWelcome = async () => {
      const agentName = effectiveDisplayName || 'AI Agent'
      const welcomeMsg = `👋 Hi! I'm ${agentName} and I've joined the call. To ask me something in the chat, just @mention me using Teams' @ feature and I'll respond!`
      try {
        console.log('Attempting to send welcome message:', welcomeMsg.substring(0, 50) + '...')
        const messageId = await meetingChat.sendMessage(welcomeMsg)
        if (messageId) {
          addLog('📤 Welcome message sent to meeting chat', 'info')
          console.log('✅ Welcome message sent successfully, ID:', messageId)
        } else {
          console.log('❌ Welcome message send returned no ID')
          addLog('⚠️ Welcome message may not have been sent', 'warning')
        }
      } catch (err) {
        console.error('❌ Failed to send welcome message:', err)
        addLog(`Failed to send welcome message: ${err}`, 'error')
      }
    }
    
    sendWelcome()
  }, [isAgentConnected, meetingChat.isConnected, meetingChat.sendMessage, effectiveDisplayName, addLog, welcomeMessageSent, setWelcomeMessageSent, connectionStatus])

  // Handle hand lowered event - deliver queued response (for raise hand mode)
  useEffect(() => {
    onHandLowered(async () => {
      if (!queuedResponseRef.current) {
        addLog('✋ Hand lowered but no queued response', 'info')
        return
      }
      
      const { text, channel } = queuedResponseRef.current
      queuedResponseRef.current = null
      
      addLog(`✋ Hand lowered - delivering queued response via ${channel}`, 'info')
      
      if (channel === 'speech' || channel === 'both') {
        await speak(text)
        addLog('🔊 Queued response spoken via TTS', 'success')
      }
      
      if (channel === 'chat' || channel === 'both') {
        if (meetingChat.isConnected) {
          await meetingChat.sendMessage(`🤖 ${text}`)
          addLog('📤 Queued response sent to chat', 'success')
        }
      }
    })
  }, [onHandLowered, speak, meetingChat, addLog])

  // Initialize TTS and Intent Detection when entering meeting
  useEffect(() => {
    if (ttsInitialized.current) return
    ttsInitialized.current = true
    
    const initializeServices = async () => {
      if (!config.speech?.key || !config.speech?.region) {
        addLog('Speech service not configured - TTS disabled', 'warning')
      } else {
        addLog('Initializing TTS service...', 'info')
        const success = await initTts()
        if (success) {
          addLog('TTS service ready', 'success')
        } else {
          addLog('TTS initialization failed', 'error')
        }
      }
      
      if (config.openai?.apiKey && config.openai?.endpoint) {
        const intentService = getIntentDetectionService()
        intentService.initialize({
          openaiEndpoint: config.openai.endpoint,
          openaiApiKey: config.openai.apiKey,
          openaiDeployment: config.openai.deployment || ''
        })
        intentServiceInitialized.current = intentService.enabled
        if (intentService.enabled) {
          addLog('🧠 AI Intent Detection enabled', 'success')
        }
      } else {
        addLog('OpenAI not configured - using basic intent detection', 'warning')
      }
    }
    
    initializeServices()
    
    // Initialize analytics
    if (!analyticsInitialized.current) {
      analyticsInitialized.current = true
      initAnalytics()
      analyticsService.startCall()
      addLog('📊 Call analytics started', 'info')
    }
  }, [config.speech, initTts, addLog, initAnalytics])

  // Initialize meeting chat when thread becomes available
  useEffect(() => {
    if (meetingChatInitialized.current) return
    
    const initChatWithToken = async (threadId: string) => {
      if (meetingChatInitialized.current) return
      meetingChatInitialized.current = true
      
      console.log('🔗 Chat thread received:', threadId.substring(0, 30) + '...')
      addLog('📬 Initializing Teams meeting chat...', 'info')
      
      const acsEndpoint = config.endpoint
      if (!acsEndpoint) {
        addLog('ACS endpoint not configured - meeting chat disabled', 'warning')
        meetingChatInitialized.current = false
        return
      }
      
      const { getCachedUserId, getCachedToken, hasValidToken } = await import('@/services/tokenService')
      
      if (!hasValidToken()) {
        addLog('No valid ACS token - meeting chat disabled', 'warning')
        meetingChatInitialized.current = false
        return
      }
      
      const userId = getCachedUserId()
      const token = getCachedToken()
      
      if (!userId || !token) {
        addLog('ACS token/userId not available - meeting chat disabled', 'warning')
        meetingChatInitialized.current = false
        return
      }
      
      const initSuccess = await meetingChat.initialize(
        acsEndpoint,
        token,
        userId,
        effectiveDisplayName
      )
      
      if (initSuccess) {
        const connectSuccess = await meetingChat.connectToThread(threadId)
        if (connectSuccess) {
          addLog('💬 Teams meeting chat connected!', 'success')
        } else {
          meetingChatInitialized.current = false
        }
      } else {
        meetingChatInitialized.current = false
      }
    }
    
    // Register callback for when thread becomes available
    onChatThreadReady(initChatWithToken)
    
    // Check if thread is already available (call already connected)
    const existingThreadId = getChatThreadId()
    console.log('📋 Checking existing thread ID:', existingThreadId ? existingThreadId.substring(0, 30) + '...' : 'none')
    if (existingThreadId && !meetingChatInitialized.current) {
      initChatWithToken(existingThreadId)
    }
    
    // Retry after a short delay if thread not available yet (race condition with call connection)
    const retryTimer = setTimeout(() => {
      if (!meetingChatInitialized.current) {
        const threadId = getChatThreadId()
        console.log('🔄 Retry checking thread ID:', threadId ? threadId.substring(0, 30) + '...' : 'none')
        if (threadId) {
          initChatWithToken(threadId)
        }
      }
    }, 2000)
    
    return () => clearTimeout(retryTimer)
  }, [config.endpoint, effectiveDisplayName, meetingChat, addLog, onChatThreadReady, getChatThreadId, meetingTab?.id])

  // Agent name variations for detection
  const agentNameVariations = useMemo(() => {
    const name = effectiveDisplayName.toLowerCase()
    const variations = [name]
    
    const parts = name.split(' ')
    parts.forEach(part => {
      if (part.length > 2 && !variations.includes(part)) {
        variations.push(part)
      }
    })
    
    if (parts.length >= 2) {
      variations.push(`${parts[0]} ${parts[parts.length - 1][0]}`)
    }
    
    return variations
  }, [effectiveDisplayName])

  // Initialize caption aggregation service
  useEffect(() => {
    if (!effectiveDisplayName) return
    
    const captionService = getCaptionAggregationService()
    captionService.initialize(effectiveDisplayName, agentNameVariations)
    
    if (config.openai?.apiKey && config.openai?.endpoint) {
      const gptSuccess = captionService.initializeGpt({
        openaiEndpoint: config.openai.endpoint,
        openaiApiKey: config.openai.apiKey,
        openaiDeployment: config.openai.deployment || ''
      })
      if (gptSuccess) {
        addLog(`🤖 GPT Caption Enhancement enabled`, 'success')
      }
    }
    
    captionAggregationInitialized.current = true
    addLog(`📝 Caption aggregation initialized for "${effectiveDisplayName}"`, 'info')
    
    return () => {
      captionService.dispose()
    }
  }, [effectiveDisplayName, agentNameVariations, config.openai, addLog])

  // Sync speech state
  useEffect(() => {
    setSpeechState(isSynthesizing ? 'synthesizing' : isSpeaking ? 'speaking' : 'idle')
  }, [isSynthesizing, isSpeaking, setSpeechState])

  // Detect mention in captions
  const detectMention = useCallback((text: string): { isMentioned: boolean; matchedVariation: string | null; fuzzyMatch?: boolean; confidence?: number } => {
    const captionService = getCaptionAggregationService()
    const result = captionService.detectMention(text)
    return {
      isMentioned: result.isMentioned,
      matchedVariation: result.matchedVariation,
      fuzzyMatch: result.fuzzyMatch,
      confidence: result.confidence
    }
  }, [])

  // Detect @mention in chat
  const detectChatMention = useCallback((text: string): { isMentioned: boolean; matchedVariation: string | null } => {
    const mentionRegex = /<span[^>]*itemtype="http:\/\/schema\.skype\.com\/Mention"[^>]*>([^<]+)<\/span>/gi
    let match
    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionedName = match[1].toLowerCase().trim()
      
      for (const variation of agentNameVariations) {
        if (mentionedName.includes(variation) || variation.includes(mentionedName)) {
          return { isMentioned: true, matchedVariation: variation }
        }
      }
    }
    
    for (const variation of agentNameVariations) {
      if (text.toLowerCase().includes(`@${variation}`)) {
        return { isMentioned: true, matchedVariation: variation }
      }
    }
    
    return { isMentioned: false, matchedVariation: null }
  }, [agentNameVariations])

  // Reset session timeout
  const resetSessionTimeout = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current)
    }
    sessionTimeoutRef.current = setTimeout(() => {
      addLog('Session timed out', 'info')
      endSession()
    }, 120000) // 120 seconds timeout (extended for long responses)
  }, [addLog, endSession])

  // Handle approving a pending response (supervised mode)
  const handleApproveResponse = useCallback(async (approval: PendingApproval) => {
    setPendingApprovals(prev => prev.filter(p => p.id !== approval.id))
    
    addLog(`✅ Approved response for ${approval.triggerAuthor}`, 'success')
    
    if (approval.channel === 'speech' || approval.channel === 'both') {
      await speak(approval.responseText)
      addLog('🔊 Approved response spoken via TTS', 'success')
    }
    
    if (approval.channel === 'chat' || approval.channel === 'both') {
      if (meetingChat.isConnected) {
        await meetingChat.sendMessage(`🤖 ${approval.responseText}`)
        addLog('📤 Approved response sent to chat', 'success')
      }
    }
  }, [speak, meetingChat, addLog])

  // Handle rejecting a pending response
  const handleRejectResponse = useCallback((approval: PendingApproval) => {
    setPendingApprovals(prev => prev.filter(p => p.id !== approval.id))
    addLog(`❌ Rejected response for ${approval.triggerAuthor}`, 'info')
  }, [addLog])

  // Process aggregated caption with behavior mode handling
  const processAggregatedCaption = useCallback(async (
    aggregatedCaption: AggregatedCaption,
    mention: MentionResult
  ) => {
    // Prevent duplicate processing
    if (isProcessingRef.current) {
      addLog(`⏳ Already processing, skipping: "${aggregatedCaption.text.substring(0, 30)}..."`, 'info')
      return
    }
    
    const currentSession = sessionRef.current
    
    if (mention.isMentioned) {
      sendThumbsUp().then(success => {
        if (success) {
          addLog(`👍 Reacted to mention from ${aggregatedCaption.speaker}`, 'info')
        }
      }).catch(() => {})
    }
    
    if (!isAgentConnected) {
      if (mention.isMentioned) {
        addLog(`Agent mentioned by ${aggregatedCaption.speaker} but not connected`, 'warning')
      }
      return
    }
    
    const captionBehavior = currentPattern?.captionMention
    
    if (captionBehavior && !captionBehavior.enabled) {
      addLog(`Caption mention ignored - trigger disabled`, 'info')
      return
    }
    
    const intentService = getIntentDetectionService()
    
    const intentResult = await intentService.shouldRespondTo(
      aggregatedCaption.text,
      aggregatedCaption.speaker,
      {
        agentName: effectiveDisplayName,
        sessionActive: currentSession.isActive,
        sessionSpeaker: currentSession.speaker,
        recentCaptions: captionHistoryRef.current.slice(-5)
      }
    )
    
    // Check if this is an end-of-conversation message (GPT-detected or fallback)
    if (intentResult.isEndOfConversation) {
      addLog(`👋 End of conversation detected from ${aggregatedCaption.speaker} (${intentResult.reason})`, 'info')
      
      // Add the goodbye message to conversation
      addMessage({
        role: 'user',
        text: `[Caption] ${aggregatedCaption.speaker}: ${aggregatedCaption.text}`,
        timestamp: new Date()
      })
      
      // Send a polite closing response
      const closingResponse = "You're welcome! Let me know if you need anything else."
      
      addMessage({
        role: 'assistant',
        text: closingResponse,
        timestamp: new Date()
      })
      
      // Speak the closing response if speech is enabled
      const responseChannel = captionBehavior?.responseChannel || 'speech'
      if (responseChannel === 'speech' || responseChannel === 'both') {
        await speak(closingResponse)
      }
      
      // End the session
      endSession()
      return
    }
    
    if (intentResult.shouldRespond) {
      // Set processing lock
      isProcessingRef.current = true
      
      if (!currentSession.isActive) {
        startSession(aggregatedCaption.speaker)
        addLog(`🟢 Session started with ${aggregatedCaption.speaker}`, 'info')
      }
      resetSessionTimeout()
      
      addLog(`Processing: "${aggregatedCaption.text}" (${intentResult.reason})`, 'info')
      
      // Add the user's message (from caption) to the agent conversation
      addMessage({
        role: 'user',
        text: `[Caption] ${aggregatedCaption.speaker}: ${aggregatedCaption.text}`,
        timestamp: new Date()
      })
      
      // Track question for analytics
      analyticsService.trackQuestion(aggregatedCaption.speaker, aggregatedCaption.text)
      
      try {
        const response = await sendAgentMessage(aggregatedCaption.text, aggregatedCaption.speaker, getMessageContext())
        if (response && response.text) {
          addLog(`Agent response: "${response.text.substring(0, 50)}..."`, 'success')
          
          // Track response for analytics
          analyticsService.trackResponse(response.text)
          
          const responseChannel = captionBehavior?.responseChannel || 'speech'
          const behaviorMode = captionBehavior?.behaviorMode || 'immediate'
          
          // Handle different behavior modes
          if (behaviorMode === 'controlled') {
            // SUPERVISED MODE - Queue for approval
            const approval: PendingApproval = {
              id: `approval-${Date.now()}`,
              responseText: response.text,
              channel: responseChannel,
              triggerContent: aggregatedCaption.text,
              triggerAuthor: aggregatedCaption.speaker,
              createdAt: new Date()
            }
            setPendingApprovals(prev => [...prev, approval])
            addLog('🛡️ Response queued for approval (Supervised mode)', 'info')
            
            addMessage({
              role: 'assistant',
              text: `🛡️ [Awaiting approval] "${response.text.substring(0, 50)}..."`,
              timestamp: new Date()
            })
          } else if (behaviorMode === 'queued' && captionBehavior?.queuedOptions?.autoRaiseHand) {
            // RAISE HAND MODE - Queue and raise hand
            queuedResponseRef.current = { text: response.text, channel: responseChannel }
            addLog('✋ Raising hand - response queued', 'info')
            await raiseHand()
            
            addMessage({
              role: 'assistant',
              text: `✋ [Hand raised] "${response.text.substring(0, 50)}..."`,
              timestamp: new Date()
            })
          } else {
            // IMMEDIATE MODE - Respond now
            // Check if this is an error response - errors should only be displayed, not spoken
            const isError = isErrorResponse(response.text)
            
            if ((responseChannel === 'speech' || responseChannel === 'both') && !isError) {
              await speak(response.text)
            } else if (isError) {
              addLog('⚠️ Error response detected - displaying only, not speaking', 'warning')
            }
            
            if (responseChannel === 'chat' || responseChannel === 'both') {
              if (meetingChat.isConnected) {
                await meetingChat.sendMessage(`🤖 ${response.text}`)
                addLog('📤 Response sent to meeting chat', 'info')
              }
            }
          }
        }
      } catch (err) {
        addLog(`Failed to get agent response: ${err}`, 'error')
      } finally {
        // Release processing lock
        isProcessingRef.current = false
      }
    }
  }, [isAgentConnected, effectiveDisplayName, currentPattern, startSession, resetSessionTimeout, sendAgentMessage, speak, raiseHand, meetingChat, addLog, addMessage, sendThumbsUp, getMessageContext, endSession])

  // Handle pending mention timeout
  const handlePendingMentionTimeout = useCallback(async (pending: PendingMention) => {
    addLog(`⏰ Pending mention timeout - processing anyway`, 'warning')
    
    const aggregatedCaption: AggregatedCaption = {
      speaker: pending.speaker,
      text: pending.captionText,
      captionIds: [],
      startTime: pending.timestamp,
      endTime: Date.now()
    }
    
    const mention: MentionResult = {
      isMentioned: true,
      matchedVariation: pending.matchedVariation,
      confidence: 1.0,
      fuzzyMatch: false
    }
    
    await processAggregatedCaption(aggregatedCaption, mention)
  }, [processAggregatedCaption, addLog])

  // Set up caption aggregation callbacks
  useEffect(() => {
    if (!captionAggregationInitialized.current) return
    
    const captionService = getCaptionAggregationService()
    
    captionService.setOnAggregatedCaption(async (aggregatedCaption, localMention) => {
      const currentSession = sessionRef.current
      const isSessionSpeaker = currentSession.isActive && aggregatedCaption.speaker === currentSession.speaker
      
      let mention = localMention
      
      if (captionService.isGptEnabled) {
        const recentContext = captionHistoryRef.current.slice(-5).map(c => `${c.speaker}: ${c.text}`)
        
        if (!localMention.isMentioned || (localMention.isMentioned && localMention.confidence < 0.85)) {
          mention = await captionService.detectMentionHybrid(aggregatedCaption.text, recentContext)
        }
      }
      
      // For autonomous patterns during an active session, also check intent detection 
      // to catch follow-up questions from other participants (not just the session speaker)
      const isAutonomousPattern = currentPattern?.id?.startsWith('autonomous')
      let shouldProcessFromIntent = false
      
      // Only use intent detection when there's an active session
      // This prevents the agent from responding to every question in the meeting
      if (isAutonomousPattern && currentSession.isActive && !mention.isMentioned && !isSessionSpeaker) {
        // Use intent detection to check if this is a question worth responding to
        const intentService = getIntentDetectionService()
        if (intentService.enabled) {
          const intentResult = await intentService.shouldRespondTo(
            aggregatedCaption.text,
            aggregatedCaption.speaker,
            {
              agentName: effectiveDisplayName,
              sessionActive: currentSession.isActive,
              sessionSpeaker: currentSession.speaker,
              recentCaptions: captionHistoryRef.current.slice(-5)
            }
          )
          
          if (intentResult.shouldRespond && intentResult.confidence >= 0.7) {
            shouldProcessFromIntent = true
            addLog(`🧠 Intent detected from ${aggregatedCaption.speaker}: "${aggregatedCaption.text.substring(0, 40)}..." (${intentResult.reason})`, 'info')
          }
        }
      }
      
      const shouldProcess = mention.isMentioned || isSessionSpeaker || shouldProcessFromIntent
      
      if (shouldProcess) {
        await processAggregatedCaption(aggregatedCaption, mention)
      }
    })
    
    captionService.setOnPendingMentionTimeout(handlePendingMentionTimeout)
    
  }, [processAggregatedCaption, handlePendingMentionTimeout, addLog, currentPattern, effectiveDisplayName])

  // Process captions - feed into aggregation service
  useEffect(() => {
    if (captions.length === 0) return
    
    const latestCaption = captions[captions.length - 1]
    
    if (latestCaption.id === lastProcessedCaptionId.current) return
    if (latestCaption.speaker === displayName) {
      lastProcessedCaptionId.current = latestCaption.id
      return
    }
    
    lastProcessedCaptionId.current = latestCaption.id
    
    captionHistoryRef.current = [
      ...captionHistoryRef.current.slice(-10),
      { speaker: latestCaption.speaker, text: latestCaption.text }
    ]
    
    if (isSpeakingRef.current) {
      stopSpeaking()
      addLog(`Interrupted by ${latestCaption.speaker}`, 'info')
    }
    
    const captionService = getCaptionAggregationService()
    captionService.addCaption({
      id: latestCaption.id,
      speaker: latestCaption.speaker,
      text: latestCaption.text,
      timestamp: Date.now(),
      isFinal: true
    })
  }, [captions, displayName, detectMention, stopSpeaking, addLog])

  // Track last processed chat message
  const lastProcessedChatMsgId = useRef<string | null>(null)

  // Process meeting chat messages for agent mentions
  useEffect(() => {
    if (!meetingChat.isConnected || meetingChat.messages.length === 0) return
    if (!isAgentConnected) return
    
    const latestMsg = meetingChat.messages[meetingChat.messages.length - 1]
    
    if (latestMsg.id === lastProcessedChatMsgId.current || latestMsg.isOwn) return
    lastProcessedChatMsgId.current = latestMsg.id
    
    const chatBehavior = currentPattern?.chatMention
    
    if (chatBehavior && !chatBehavior.enabled) return
    
    const mentionResult = detectChatMention(latestMsg.content)
    
    if (mentionResult.isMentioned) {
      addLog(`💬 Agent @mentioned in chat by ${latestMsg.senderDisplayName}`, 'info')
      
      sendThumbsUp().catch(() => {})
      
      const processChat = async () => {
        try {
          // Extract plain text from HTML content (Teams uses HTML for mentions)
          const plainTextContent = extractMessageText(latestMsg.content)
          
          // Use intent detection service to check for end-of-conversation
          const intentService = getIntentDetectionService()
          const intentResult = await intentService.shouldRespondTo(
            plainTextContent,
            latestMsg.senderDisplayName,
            {
              agentName: effectiveDisplayName,
              sessionActive: sessionRef.current.isActive,
              sessionSpeaker: sessionRef.current.speaker,
              recentCaptions: [] // No caption history for chat
            }
          )
          
          // Check for goodbye/thank you - end session gracefully
          if (sessionRef.current.isActive && intentResult.isEndOfConversation) {
            addLog(`👋 End of conversation detected from ${latestMsg.senderDisplayName} (chat) - ${intentResult.reason}`, 'info')
            
            addMessage({
              role: 'user',
              text: `[Chat] ${latestMsg.senderDisplayName}: ${plainTextContent}`,
              timestamp: new Date()
            })
            
            const closingResponse = "You're welcome! Let me know if you need anything else."
            
            addMessage({
              role: 'assistant',
              text: closingResponse,
              timestamp: new Date()
            })
            
            // Send closing response to chat
            if (meetingChat.isConnected) {
              await meetingChat.sendMessage(`🤖 ${closingResponse}`)
            }
            
            endSession()
            return
          }
          
          if (!sessionRef.current.isActive) {
            startSession(latestMsg.senderDisplayName)
            addLog(`🟢 Session started with ${latestMsg.senderDisplayName} (chat)`, 'info')
          }
          resetSessionTimeout()
          
          addMessage({
            role: 'user',
            text: `[Chat] ${latestMsg.senderDisplayName}: ${plainTextContent}`,
            timestamp: new Date()
          })
          
          const response = await sendAgentMessage(plainTextContent, latestMsg.senderDisplayName, getMessageContext())
          
          if (response && response.text) {
            addLog(`Agent response to chat: "${response.text.substring(0, 50)}..."`, 'success')
            
            const responseChannel = chatBehavior?.responseChannel || 'chat'
            const behaviorMode = chatBehavior?.behaviorMode || 'immediate'
            
            // Handle different behavior modes
            if (behaviorMode === 'controlled') {
              // SUPERVISED MODE
              const approval: PendingApproval = {
                id: `approval-${Date.now()}`,
                responseText: response.text,
                channel: responseChannel,
                triggerContent: latestMsg.content,
                triggerAuthor: latestMsg.senderDisplayName,
                createdAt: new Date()
              }
              setPendingApprovals(prev => [...prev, approval])
              addLog('🛡️ Response queued for approval (Supervised mode)', 'info')
              
              addMessage({
                role: 'assistant',
                text: `🛡️ [Awaiting approval] "${response.text.substring(0, 50)}..."`,
                timestamp: new Date()
              })
            } else if (behaviorMode === 'queued' && chatBehavior?.queuedOptions?.autoRaiseHand) {
              // RAISE HAND MODE
              queuedResponseRef.current = { text: response.text, channel: responseChannel }
              addLog('✋ Raising hand - response queued', 'info')
              await raiseHand()
              
              addMessage({
                role: 'assistant',
                text: `✋ [Hand raised] "${response.text.substring(0, 50)}..."`,
                timestamp: new Date()
              })
            } else {
              // IMMEDIATE MODE
              // Check if this is an error response - errors should only be displayed, not spoken
              const isError = isErrorResponse(response.text)
              
              if (responseChannel === 'chat' || responseChannel === 'both') {
                if (meetingChat.isConnected) {
                  await meetingChat.sendMessage(`🤖 ${response.text}`)
                  addLog('📤 Response sent to meeting chat', 'info')
                }
              }
              
              if ((responseChannel === 'speech' || responseChannel === 'both') && !isError) {
                await speak(response.text)
                addLog('🔊 Response spoken via TTS', 'info')
              } else if (isError) {
                addLog('⚠️ Error response detected - displaying only, not speaking', 'warning')
              }
            }
          }
        } catch (err) {
          addLog(`Failed to process chat mention: ${err}`, 'error')
        }
      }
      
      processChat()
    }
  }, [meetingChat.messages, meetingChat.isConnected, isAgentConnected, currentPattern, detectChatMention, addLog, sendThumbsUp, raiseHand, startSession, resetSessionTimeout, addMessage, sendAgentMessage, speak, getMessageContext, endSession])

  // Cleanup
  useEffect(() => {
    return () => {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current)
      }
    }
  }, [])

  // Auto-scroll for all three columns
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [conversationMessages])

  useEffect(() => {
    if (meetingChatEndRef.current) {
      meetingChatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [meetingChat.messages])

  useEffect(() => {
    if (captionsEndRef.current) {
      captionsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
    // Note: Caption tracking for analytics happens in useAcsCall hook to avoid duplicates
  }, [captions])

  // Video preview binding
  useEffect(() => {
    let mounted = true

    const bindStream = () => {
      if (!mounted) return
      
      const stream = window.agentVideoPreviewStream
      const canvas = window.agentVideoPreviewCanvas
      
      if (videoPreviewRef.current && stream && stream.active) {
        if (videoPreviewRef.current.srcObject !== stream) {
          videoPreviewRef.current.srcObject = stream
          videoPreviewRef.current.play().catch(() => {})
        }
        setHasVideoPreview(true)
        return
      }
      
      if (videoPreviewRef.current && canvas) {
        try {
          const canvasStream = canvas.captureStream ? canvas.captureStream(30) : null
          if (canvasStream && canvasStream.active) {
            if (videoPreviewRef.current.srcObject !== canvasStream) {
              videoPreviewRef.current.srcObject = canvasStream
              videoPreviewRef.current.play().catch(() => {})
            }
            setHasVideoPreview(true)
            return
          }
        } catch (e) {}
      }
      
      setHasVideoPreview(false)
    }

    bindStream()
    const interval = setInterval(bindStream, 500)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [connectionStatus])

  const handleLeaveCall = useCallback(async () => {
    addLog('Leaving meeting...', 'info')
    // End analytics tracking
    analyticsService.endCall()
    addLog('📊 Call analytics saved', 'info')
    await leaveCall()
    setStage('summary')
  }, [addLog, leaveCall, setStage])

  const handleSpeak = useCallback(async () => {
    if (!ttsText.trim()) return
    
    addLog(`Speaking: "${ttsText.substring(0, 50)}..."`, 'info')
    const success = await speak(ttsText)
    
    if (success) {
      setTtsText('')
      addLog('Speech completed', 'success')
    } else {
      addLog('Speech failed', 'error')
    }
  }, [ttsText, speak, addLog])

  const handleStopSpeaking = useCallback(() => {
    stopSpeaking()
    addLog('Speech stopped', 'info')
  }, [stopSpeaking, addLog])

  const handleSetSpeechRate = useCallback((rate: number) => {
    console.log('Setting speech rate to:', rate)
    setSpeechRateLocal(rate)
    setSpeechRate(rate)
  }, [setSpeechRate])

  // Unused but kept for potential future use
  // const handleStartConversation = useCallback(async () => {
  //   if (!agentConfig) {
  //     addLog('No agent configuration available', 'error')
  //     return
  //   }
  //   
  //   addLog(`Starting ${agentConfig.type} agent conversation...`, 'info')
  //   
  //   const result = await connectAgent(agentConfig)
  //   
  //   if (result.success) {
  //     if (meetingTab && result.conversationId) {
  //       setTabConversationId(meetingTab.id, result.conversationId)
  //     }
  //     addLog('Agent connected', 'success')
  //   } else {
  //     addLog('Failed to connect agent', 'error')
  //   }
  // }, [connectAgent, addLog, meetingTab, setTabConversationId, agentConfig])

  const handleSendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !isAgentConnected || isSendingChat) return
    
    const messageText = chatInput.trim()
    setChatInput('')
    setIsSendingChat(true)
    
    addMessage({
      role: 'user',
      text: messageText,
      timestamp: new Date()
    })
    
    // Track question for analytics
    analyticsService.trackQuestion('Chat User', messageText)
    
    try {
      const response = await sendAgentMessage(messageText, 'Chat User', getMessageContext())
      if (response && response.text) {
        addLog(`Agent response: "${response.text.substring(0, 50)}..."`, 'success')
        // Track response for analytics
        analyticsService.trackResponse(response.text)
      }
    } catch (err) {
      addLog(`Failed to get response: ${err}`, 'error')
    } finally {
      setIsSendingChat(false)
    }
  }, [chatInput, isAgentConnected, isSendingChat, addMessage, sendAgentMessage, addLog, getMessageContext])

  const handleSendMeetingChatMessage = useCallback(async () => {
    if (!meetingChatInput.trim() || !meetingChat.isConnected || isSendingMeetingChat) return
    
    const messageText = meetingChatInput.trim()
    setMeetingChatInput('')
    setIsSendingMeetingChat(true)
    
    try {
      // Add subtle disclaimer for operator-sent messages
      const messageWithDisclaimer = `📝 *[Sent by operator on behalf of ${effectiveDisplayName}]*\n\n${messageText}`
      const success = await meetingChat.sendMessage(messageWithDisclaimer)
      if (!success) {
        addLog('Failed to send meeting chat message', 'error')
      }
    } catch (err) {
      addLog(`Failed to send meeting chat: ${err}`, 'error')
    } finally {
      setIsSendingMeetingChat(false)
    }
  }, [meetingChatInput, meetingChat, isSendingMeetingChat, effectiveDisplayName, addLog])

  // Get current behavior for quick display
  const getBehaviorLabel = () => {
    switch (currentPatternId) {
      case 'autonomous-mixed': return { icon: Zap, label: 'Auto', color: 'text-green-600' }
      case 'supervised': return { icon: Shield, label: 'Review', color: 'text-orange-600' }
      case 'polite-queue-mixed': return { icon: Hand, label: 'Raise Hand', color: 'text-blue-600' }
      default: return { icon: Zap, label: 'Custom', color: 'text-muted-foreground' }
    }
  }
  const behaviorInfo = getBehaviorLabel()
  const BehaviorIcon = behaviorInfo.icon

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* TOP BAR - Controls & Status */}
      <div className="border-b bg-card/90 backdrop-blur-sm px-4 py-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground/80">
          <span className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-full',
            connectionStatus === 'connected' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' :
            connectionStatus === 'in-lobby' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
            'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
          )}>
            <span className={cn(
              'w-2 h-2 rounded-full',
              connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'in-lobby' ? 'bg-amber-500' : 'bg-slate-400'
            )} />
            {connectionStatus === 'connected' ? 'In meeting' : connectionStatus === 'in-lobby' ? 'Lobby' : 'Connecting'}
          </span>

          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-foreground/80 ring-1 ring-border">
            <Bot className="w-3.5 h-3.5" />
            <span className={isAgentConnected ? 'text-green-700' : 'text-muted-foreground'}>{effectiveDisplayName || 'Agent'}</span>
          </span>

          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-foreground/80 ring-1 ring-border">
            <Volume2 className="w-3.5 h-3.5" />
            <span>Voice</span>
            <span className="text-foreground/90 font-semibold">{agentVoiceLabel}</span>
          </span>

          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-foreground/80 ring-1 ring-border">
            <Settings className="w-3.5 h-3.5" />
            <span>Type</span>
            <span className="text-foreground/90 font-semibold">{agentTypeLabel}</span>
          </span>

          <button
            onClick={() => setShowAgentConfig(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-foreground/80 ring-1 ring-border hover:ring-primary/50 transition"
          >
            <BehaviorIcon className="w-3.5 h-3.5" />
            <span className="font-semibold text-foreground">{behaviorInfo.label}</span>
            {showAgentConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-muted-foreground">
              <span className="text-[11px] uppercase tracking-wide">Speed</span>
              <select
                className="h-7 px-2 text-sm border rounded bg-background cursor-pointer hover:border-primary/50 transition-colors"
                value={speechRateLocal}
                onChange={(e) => handleSetSpeechRate(parseFloat(e.target.value))}
              >
                <option value={0.75}>0.75x</option>
                <option value={1.0}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={1.75}>1.75x</option>
                <option value={2.0}>2.0x</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {(isSpeaking || isSynthesizing) && (
              <Button variant="destructive" size="sm" onClick={handleStopSpeaking} className="animate-pulse">
                <Square className="w-3 h-3 mr-1" />
                Stop Speaking
              </Button>
            )}

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowVideoPreview(v => !v)} title="Video preview">
              <Video className="w-4 h-4" />
            </Button>
            
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTts(v => !v)} title="Voice controls">
              <Volume2 className="w-4 h-4" />
            </Button>
            
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleLogs} title="Debug logs">
              <Bug className="w-4 h-4" />
            </Button>
            
            <div className="w-px h-6 bg-border mx-1" />
            
            <Button variant="destructive" size="sm" onClick={handleLeaveCall}>
              <PhoneOff className="w-4 h-4 mr-1" />
              Leave
            </Button>
          </div>
        </div>
      </div>

      {/* BEHAVIOR CONFIG PANEL (collapsible) */}
      {showAgentConfig && (
        <div className="border-b bg-muted/30 px-4 py-2 shrink-0">
          <div className="flex items-center gap-4">
            {/* Behavior Mode */}
            <span className="text-sm font-medium">Mode:</span>
            {[
              { id: 'autonomous-mixed', name: 'Auto', icon: Zap },
              { id: 'polite-queue-mixed', name: 'Raise Hand', icon: Hand },
              { id: 'supervised', name: 'Review', icon: Shield },
            ].map(opt => {
              const Icon = opt.icon
              const isSelected = currentPatternId === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setCurrentPattern(opt.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-all",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border hover:border-primary/50"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* PENDING APPROVALS BAR (Supervised mode) */}
      {pendingApprovals.length > 0 && (
        <div className="border-b bg-orange-500/10 px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-600">
              {pendingApprovals.length} response{pendingApprovals.length > 1 ? 's' : ''} awaiting approval
            </span>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {pendingApprovals.map(approval => (
              <div key={approval.id} className="flex items-start gap-2 p-2 bg-background rounded-md border">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    {approval.triggerAuthor}: "{approval.triggerContent.substring(0, 50)}..."
                  </p>
                  <p className="text-sm">{approval.responseText}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                    onClick={() => handleApproveResponse(approval)}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                    onClick={() => handleRejectResponse(approval)}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EXPANDABLE PANELS (Video, TTS, Logs) */}
      {showVideoPreview && (
        <div className="border-b bg-muted/30 px-4 py-3 shrink-0">
          <div className="h-40 rounded-md border bg-black overflow-hidden flex items-center justify-center">
            {hasVideoPreview ? (
              <video ref={videoPreviewRef} className="h-full w-full object-contain" autoPlay muted playsInline />
            ) : (
              <ParticleSpherePreview width={320} height={160} className="rounded-md" />
            )}
          </div>
        </div>
      )}

      {showTts && (
        <div className="border-b bg-muted/30 px-4 py-3 shrink-0">
          <div className="flex gap-2 items-center">
            <Textarea
              placeholder="Type a message to speak (debug)..."
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              rows={1}
              className="min-h-[36px] resize-none flex-1"
              disabled={speechState !== 'idle'}
            />
            <Button onClick={handleSpeak} disabled={speechState !== 'idle' || !ttsText.trim()} size="sm">
              <Volume2 className="w-4 h-4 mr-1" />
              Speak
            </Button>
            <Button variant="outline" onClick={handleStopSpeaking} disabled={speechState === 'idle'} size="sm">
              <Square className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {isLogsExpanded && (
        <div className="border-b bg-muted/30 px-4 py-2 max-h-40 overflow-hidden shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">Logs</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearLogs}>Clear</Button>
          </div>
          <ScrollArea className="h-28">
            <div className="space-y-0.5 text-xs font-mono">
              {logs.slice().reverse().map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    "px-1.5 py-0.5 rounded",
                    log.type === 'error' && "bg-red-500/10 text-red-600",
                    log.type === 'success' && "bg-green-500/10 text-green-600",
                    log.type === 'info' && "bg-blue-500/10 text-blue-600",
                    log.type === 'warning' && "bg-yellow-500/10 text-yellow-600"
                  )}
                >
                  <span className="opacity-50">{log.timestamp.toLocaleTimeString()}</span> {log.message}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* SEARCH BAR */}
      <div className="border-b bg-muted/20 px-4 py-2 shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search messages across all columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-8 text-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* MAIN CONTENT - 3 columns: Captions | Meeting Chat | AI Agent */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* LEFT: Live Captions */}
        <div className="flex-1 flex flex-col border-r min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0">
            <h3 className="font-medium text-sm flex items-center gap-2">
              📝 Live Captions
            </h3>
            <Badge variant="outline" className="text-xs">
              {searchQuery ? `${filteredCaptions.length}/${captions.length}` : captions.length}
            </Badge>
          </div>
          <ScrollArea className="flex-1 p-3">
            {filteredCaptions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">
                {searchQuery ? 'No captions match your search' : 'Captions will appear when someone speaks...'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filteredCaptions.map((caption) => (
                  <div key={caption.id} className="p-2 rounded bg-muted/50 text-sm">
                    <span className="font-medium text-primary">{caption.speaker}: </span>
                    <span>{caption.text}</span>
                  </div>
                ))}
                <div ref={captionsEndRef} />
              </div>
            )}
          </ScrollArea>
        </div>

        {/* CENTER: Meeting Chat */}
        <div className="flex-1 flex flex-col border-r min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Meeting Chat
            </h3>
            <div className="flex items-center gap-2">
              {meetingChat.messages.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {searchQuery ? `${filteredMeetingChatMessages.length}/${meetingChat.messages.length}` : meetingChat.messages.length}
                </Badge>
              )}
              <span className={cn(
                "w-2 h-2 rounded-full",
                meetingChat.isConnected ? "bg-green-500" : meetingChat.isConnecting ? "bg-yellow-500 animate-pulse" : "bg-gray-400"
              )} />
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-3">
            {filteredMeetingChatMessages.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">
                {searchQuery 
                  ? 'No messages match your search'
                  : meetingChat.isConnected 
                    ? 'No messages yet'
                    : meetingChat.isConnecting
                      ? 'Connecting...'
                      : 'Waiting for connection...'}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredMeetingChatMessages.map((msg) => {
                  // Strip HTML tags and decode entities from content for display
                  const plainContent = extractMessageText(msg.content)
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "p-2 rounded-lg max-w-[90%] text-sm",
                        msg.isOwn 
                          ? "bg-primary text-primary-foreground ml-auto"
                          : "bg-muted"
                      )}
                    >
                      {!msg.isOwn && (
                        <p className="text-xs font-medium mb-0.5 opacity-70">{msg.senderDisplayName}</p>
                      )}
                      <p>{plainContent}</p>
                      <p className="text-xs opacity-50 mt-0.5">{msg.createdOn.toLocaleTimeString()}</p>
                    </div>
                  )
                })}
                <div ref={meetingChatEndRef} />
              </div>
            )}
          </ScrollArea>
          
          {/* Meeting Chat Input */}
          <div className="border-t p-2 bg-background shrink-0">
            <div className="flex gap-2">
              <Textarea
                placeholder={meetingChat.isConnected ? "Send to meeting..." : "Waiting for connection..."}
                value={meetingChatInput}
                onChange={(e) => setMeetingChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMeetingChatMessage()
                  }
                }}
                disabled={!meetingChat.isConnected || isSendingMeetingChat}
                rows={1}
                className="min-h-[36px] max-h-[80px] resize-none text-sm"
              />
              <Button
                onClick={handleSendMeetingChatMessage}
                disabled={!meetingChat.isConnected || !meetingChatInput.trim() || isSendingMeetingChat}
                size="icon"
                className="h-9 w-9 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT: AI Agent */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Bot className="w-4 h-4" />
              AI Agent
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                clearMessages()
                endSession()
                setSentToMeetingIds(new Set())
                addLog('Conversation reset', 'info')
              }}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>
          
          {/* Session indicator with terminate option */}
          <div className={cn(
            "flex items-center justify-between px-4 py-1.5 text-xs shrink-0",
            session.isActive ? "bg-green-500/10 text-green-600" : "bg-muted/50 text-muted-foreground"
          )}>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                session.isActive ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
              )} />
              {session.isActive 
                ? `Session with ${session.speaker}`
                : 'Waiting for mention...'}
            </div>
            {session.isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  addLog(`🛑 Session manually terminated`, 'info')
                  endSession()
                }}
              >
                <XCircle className="w-3 h-3 mr-1" />
                End Session
              </Button>
            )}
          </div>
          
          <ScrollArea className="flex-1 p-3">
            {filteredAgentMessages.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">
                {searchQuery ? 'No messages match your search' : auth.isAuthenticated 
                  ? 'Mention the agent or type a message...'
                  : 'Sign in to enable AI'}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredAgentMessages.map((msg) => {
                  const isSent = sentToMeetingIds.has(msg.id)
                  const isAssistant = msg.role === 'assistant'
                  const canSend = isAssistant && meetingChat.isConnected && !msg.text?.startsWith('🛡️') && !msg.text?.startsWith('✋')
                  
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "p-2 rounded-lg max-w-[90%] text-sm break-words overflow-hidden group relative",
                        msg.role === 'user' 
                          ? "bg-primary text-primary-foreground ml-auto"
                          : "bg-muted"
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="whitespace-pre-wrap break-words mb-1 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            a: ({ href, children }) => (
                              <a 
                                href={href} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary underline hover:no-underline"
                              >
                                {children}
                              </a>
                            ),
                            ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                            li: ({ children }) => <li>{children}</li>,
                            code: ({ children }) => <code className="bg-background/50 px-1 rounded text-xs font-mono">{children}</code>,
                          }}
                        >
                          {msg.text || ''}
                        </ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs opacity-50">{msg.timestamp.toLocaleTimeString()}</p>
                        {canSend && (
                          <button
                            onClick={async () => {
                              if (!isSent) {
                                try {
                                  await meetingChat.sendMessage(`🤖 ${msg.text}`)
                                  setSentToMeetingIds(prev => new Set([...prev, msg.id]))
                                  addLog('Sent to meeting chat', 'success')
                                } catch {
                                  addLog('Failed to send', 'error')
                                }
                              }
                            }}
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded transition-all",
                              isSent 
                                ? "text-green-600 bg-green-500/10" 
                                : "text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100"
                            )}
                            disabled={isSent}
                          >
                            {isSent ? '✓ Sent' : '→ Send to Meeting'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={conversationEndRef} />
              </div>
            )}
          </ScrollArea>
          
          {/* AI Agent Chat Input */}
          <div className="border-t p-2 bg-background shrink-0">
            <div className="flex gap-2">
              <Textarea
                placeholder={isAgentConnected ? "Chat with agent..." : "Agent not connected..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendChatMessage()
                  }
                }}
                disabled={!isAgentConnected || isSendingChat}
                rows={1}
                className="min-h-[36px] max-h-[80px] resize-none text-sm"
              />
              <Button
                onClick={handleSendChatMessage}
                disabled={!isAgentConnected || !chatInput.trim() || isSendingChat}
                size="icon"
                className="h-9 w-9 shrink-0"
              >
                {isSendingChat ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
