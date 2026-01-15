import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useCallStore } from '@/stores/callStore'
import { useAgentStore } from '@/stores/agentStore'
import { useConfigStore } from '@/stores/configStore'
import { useTabsStore, selectActiveTab, selectMeetingTabs } from '@/stores/tabsStore'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { useCopilotAuth } from '@/hooks/useCopilotAuth'
import { useAcsCall } from '@/hooks/useAcsCall'
import { getOrCreateToken } from '@/services/tokenService'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Phone, Bot, Loader2, CheckCircle, XCircle, AlertCircle, User, ShieldCheck, Shield } from 'lucide-react'
import type { MeetingTab } from '@/types'

type JoinStep = 'token' | 'init' | 'joining' | 'lobby' | 'connected' | 'error'

// Map provider types to display names
const providerTypeLabels: Record<string, string> = {
  'copilot-studio': 'Copilot Studio',
  'copilot-studio-anon': 'Copilot Anonymous',
  'azure-foundry': 'Azure Foundry',
}

export function ConnectingStage() {
  const addLog = useAppStore((state) => state.addLog)
  const { config } = useConfigStore()
  const joinStarted = useRef(false)
  
  // Tab support
  const activeTab = useTabsStore(selectActiveTab)
  const meetingTabs = useTabsStore(selectMeetingTabs)
  const setActiveTab = useTabsStore((state) => state.setActiveTab)
  const closeMeetingTab = useTabsStore((state) => state.closeMeetingTab)
  const meetingTab = activeTab?.type === 'meeting' ? activeTab as MeetingTab : null
  const meetingUrl = meetingTab?.meetingUrl || ''
  const meetingAgentName = meetingTab?.agentName
  const activeProviderId = meetingTab?.activeProviderId
  
  // Debug log the meeting tab state
  console.log(`📋 ConnectingStage render: meetingTab.agentName="${meetingAgentName}", activeProviderId="${activeProviderId}"`)
  
  // Get provider details
  const getProvider = useAgentProvidersStore((state) => state.getProvider)
  const activeProvider = useMemo(() => {
    return activeProviderId ? getProvider(activeProviderId) : undefined
  }, [activeProviderId, getProvider])
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
  
  const { startCall, connectionStatus, setConnectionStatus, setWelcomeMessageSent } = useCallStore()
  const { setDisplayName } = useAgentStore()
  
  // Hooks
  const { isAuthenticated } = useCopilotAuth()
  const { initialize: initializeAcs, joinMeeting, resetInitialization } = useAcsCall()
  
  // Use a unique key based on meeting URL + agent name to force fresh state
  const stateKey = useMemo(() => `${meetingUrl}-${meetingAgentName}-${activeProviderId}`, [meetingUrl, meetingAgentName, activeProviderId])
  
  const [currentStep, setCurrentStep] = useState<JoinStep>('token')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Auto-join on mount or when meeting changes
  const joinMeetingFlow = useCallback(async () => {
    // Prevent duplicate join (React StrictMode protection)
    if (joinStarted.current) {
      console.log('Join already started, skipping duplicate call')
      return
    }
    joinStarted.current = true

    // Safety: block if another meeting is already active (ACS single-session limitation)
    const activeMeeting = meetingTabs.find(t => 
      t.id !== meetingTab?.id && 
      (t.stage === 'connect' || t.stage === 'meeting')
    )
    if (activeMeeting) {
      const message = 'Another meeting is active. Please leave it first.'
      addLog(message, 'error')
      setErrorMessage(message)
      setCurrentStep('error')
      return
    }

    const normalize = (val?: string | null) => (val || '').trim().toLowerCase()
    const duplicateTab = meetingTabs.find((t) => {
      const mt = t as MeetingTab
      return (
        t.id !== meetingTab?.id &&
        normalize(mt.meetingUrl) === normalize(meetingUrl) &&
        normalize(mt.agentName) === normalize(meetingAgentName) &&
        (mt.activeProviderId || null) === (activeProviderId ?? null)
      )
    })

    if (duplicateTab) {
      const message = 'This meeting/agent is already open in another tab.'
      addLog(message, 'warning')
      setErrorMessage(message)
      setCurrentStep('error')
      setActiveTab(duplicateTab.id)
      return
    }
    
    console.log(`🎯 joinMeetingFlow starting with meetingAgentName="${meetingAgentName}"`)
    
    if (!meetingUrl) {
      setErrorMessage('No meeting URL provided')
      setCurrentStep('error')
      return
    }

    try {
      // Step 1: Generate token
      setCurrentStep('token')
      addLog('Generating ACS token...', 'info')
      const { token } = await getOrCreateToken(config.endpoint, config.accessKey)
      addLog('Token generated successfully', 'success')
      
      // Step 2: Initialize ACS (hook handles re-init if agent name changed)
      setCurrentStep('init')
      const agentNameToUse = meetingAgentName || 'AI Agent'
      
      console.log(`🎯 About to initialize ACS with agentNameToUse="${agentNameToUse}"`)
      
      if (meetingAgentName) {
        setDisplayName(meetingAgentName)
      }
      
      addLog(`Initializing call client as "${agentNameToUse}"...`, 'info')
      const initResult = await initializeAcs(token, agentNameToUse)
      if (!initResult.success) {
        throw new Error(initResult.error || 'Failed to initialize call client')
      }

      // Step 3: Join meeting
      setCurrentStep('joining')
      addLog('Joining Teams meeting...', 'info')
      const success = await joinMeeting(meetingUrl)
      
      if (success) {
        startCall()
        addLog('✓ Call initiated, waiting to connect...', 'success')
      } else {
        throw new Error('Failed to join meeting')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join meeting'
      setErrorMessage(message)
      setCurrentStep('error')
      addLog(`✗ Join failed: ${message}`, 'error')
    }
  }, [meetingUrl, meetingAgentName, meetingTabs, meetingTab?.id, activeProviderId, config.endpoint, config.accessKey, setDisplayName, initializeAcs, joinMeeting, startCall, addLog, setActiveTab])

  // Reset and start join when meeting target changes
  useEffect(() => {
    let cancelled = false
    
    const resetAndJoin = async () => {
      // Reset all state first - await the async reset
      await resetInitialization()
      
      if (cancelled) return
      
      setErrorMessage(null)
      setCurrentStep('token')
      joinStarted.current = false
      setConnectionStatus('connecting')
      setWelcomeMessageSent(false)
      
      // Now start the join flow
      joinMeetingFlow()
    }
    
    resetAndJoin()
    
    return () => {
      cancelled = true
    }
  }, [stateKey, resetInitialization, setConnectionStatus, setWelcomeMessageSent, joinMeetingFlow])

  // Update step based on connection status
  useEffect(() => {
    if (connectionStatus === 'in-lobby') {
      // Only set lobby step if we're past the joining phase
      if (currentStep === 'joining' || currentStep === 'lobby') {
        setCurrentStep('lobby')
      }
    } else if (connectionStatus === 'connected') {
      setCurrentStep('connected')
    } else if (connectionStatus === 'disconnected') {
      // Ignore initial/disconnected states before a join attempt starts
      if (!joinStarted.current || currentStep === 'token' || currentStep === 'init') return
      setErrorMessage('Meeting ended or you were removed')
      setCurrentStep('error')
    } else if (connectionStatus === 'error') {
      setErrorMessage('Failed to connect to meeting')
      setCurrentStep('error')
    }
  }, [connectionStatus, currentStep])

  const handleCancel = useCallback(() => {
    if (meetingTab) {
      closeMeetingTab(meetingTab.id)
    }
  }, [meetingTab, closeMeetingTab])

  const handleRetry = useCallback(() => {
    setErrorMessage(null)
    setCurrentStep('token')
    joinStarted.current = false  // Reset guard for retry
    joinMeetingFlow()
  }, [joinMeetingFlow])

  const getStepStatus = (step: JoinStep): 'done' | 'active' | 'pending' | 'error' => {
    if (currentStep === 'error') return 'error'
    
    const stepOrder: JoinStep[] = ['token', 'init', 'joining', 'lobby', 'connected']
    const currentIndex = stepOrder.indexOf(currentStep)
    const stepIndex = stepOrder.indexOf(step)
    
    if (stepIndex < currentIndex) return 'done'
    if (stepIndex === currentIndex) return 'active'
    return 'pending'
  }

  const steps = [
    { id: 'token' as JoinStep, label: 'Token' },
    { id: 'init' as JoinStep, label: 'Initialize' },
    { id: 'joining' as JoinStep, label: 'Joining' },
    { id: 'lobby' as JoinStep, label: 'Lobby' },
  ]

  return (
    <div key={stateKey} className="flex flex-col items-center justify-center h-full p-6 gap-6">
      {/* Compact Status Card */}
      <div className="flex flex-col items-center gap-4 max-w-lg w-full">
        {/* Icon and Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            {currentStep === 'error' ? (
              <XCircle className="w-5 h-5 text-destructive" />
            ) : currentStep === 'lobby' ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <Phone className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {currentStep === 'error' ? 'Connection Failed' : 
               currentStep === 'lobby' ? 'Waiting in Lobby' : 
               'Connecting...'}
            </h2>
          </div>
        </div>

        {/* Horizontal Progress Steps */}
        <div className="flex items-center gap-1 w-full justify-center">
          {steps.map((step, i) => {
            const status = getStepStatus(step.id)
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    status === 'done' ? 'bg-success text-success-foreground' :
                    status === 'active' ? 'bg-primary text-primary-foreground' :
                    status === 'error' ? 'bg-destructive text-destructive-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {status === 'done' ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : status === 'active' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : status === 'error' ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <span className={`text-[10px] ${status === 'active' ? 'font-medium' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 mb-4 ${
                    getStepStatus(steps[i + 1].id) !== 'pending' ? 'bg-success' : 'bg-muted'
                  }`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Agent Info Card */}
        <div className="w-full max-w-xl rounded-xl border bg-card/60 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-xs font-medium text-muted-foreground">Agent session</div>
            {activeProvider?.type && (
              <Badge variant="outline" className="text-[11px] px-2 py-1">
                {providerTypeLabels[activeProvider.type] || activeProvider.type}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeProvider && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Agent</p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {providerDisplayName || activeProvider.name}
                  </p>
                </div>
              </div>
            )}

            {meetingAgentName && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Display name</p>
                  <p className="text-sm font-semibold text-foreground truncate">{meetingAgentName}</p>
                </div>
              </div>
            )}

            {activeProvider?.type === 'copilot-studio' && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-success/10 text-success">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Auth</p>
                  <p className="text-sm font-semibold">
                    {isAuthenticated ? 'Ready' : 'Not signed in'}
                  </p>
                </div>
              </div>
            )}

            {activeProvider?.type === 'copilot-studio-anon' && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Auth</p>
                  <p className="text-sm font-semibold">Anonymous</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error or Lobby Message */}
        {currentStep === 'error' && errorMessage && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {currentStep === 'lobby' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Waiting for the organizer to admit you...</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {currentStep === 'error' ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
