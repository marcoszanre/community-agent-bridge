import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useCallStore } from '@/stores/callStore'
import { useAgentStore } from '@/stores/agentStore'
import { useConfigStore } from '@/stores/configStore'
import { useTabsStore, selectActiveTab } from '@/stores/tabsStore'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { useCopilotAuth } from '@/hooks/useCopilotAuth'
import { useAcsCall } from '@/hooks/useAcsCall'
import { getOrCreateToken } from '@/services/tokenService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Bot, LogIn, X, Copy, ExternalLink, CheckCircle, Loader2, Clipboard, Eraser, ShieldCheck } from 'lucide-react'
import type { MeetingTab } from '@/types'

export function ConnectStage() {
  const addLog = useAppStore((state) => state.addLog)
  const { config } = useConfigStore()
  
  // Tab support - get meeting URL and agent name from active tab if it's a meeting tab
  const activeTab = useTabsStore(selectActiveTab)
  const meetingTab = activeTab?.type === 'meeting' ? activeTab as MeetingTab : null
  const meetingTabUrl = meetingTab?.meetingUrl
  const meetingAgentName = meetingTab?.agentName
  const meetingProviderId = meetingTab?.activeProviderId || null

  const getProvider = useAgentProvidersStore((state) => state.getProvider)
  const activeProvider = meetingProviderId ? getProvider(meetingProviderId) : undefined
  const isCopilotStudio = activeProvider?.type === 'copilot-studio'
  
  const { meetingUrl, setMeetingUrl, startCall, connectionStatus } = useCallStore()
  const { auth, setDisplayName } = useAgentStore()
  
  // Real hooks
  const { 
    startAuth, 
    cancelAuth, 
    openVerificationUrl, 
    copyUserCode,
    authState, 
    deviceCode, 
    isAuthenticated, 
    isAuthenticating 
  } = useCopilotAuth()
  
  const { initialize: initializeAcs, joinMeeting } = useAcsCall()
  
  const [isJoining, setIsJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const providerReadiness = () => {
    if (!activeProvider) return 'Select a provider before joining'
    const s = activeProvider.settings as Record<string, string | undefined>

    if (activeProvider.type === 'copilot-studio') {
      if (!s.clientId || !s.tenantId || !s.environmentId || !s.botId) return 'Copilot Studio needs clientId, tenantId, environmentId, and botId'
    } else if (activeProvider.type === 'copilot-studio-anon') {
      if (!s.directLineSecret) return 'Copilot Anon needs a Direct Line secret'
    } else if (activeProvider.type === 'azure-foundry') {
      if (!s.projectEndpoint || !s.clientId || !s.clientSecret || !s.tenantId) return 'Foundry needs endpoint, tenant, clientId, and clientSecret'
    }

    return null
  }

  const isLikelyTeamsUrl = (value: string) => /https?:\/\/.*teams\.microsoft\.com/i.test(value.trim())

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setMeetingUrl(text.trim())
        setJoinError(null)
      }
    } catch (err) {
      addLog('Unable to read clipboard', 'error')
    }
  }

  // Initialize meeting URL from tab or config (env) if not already set
  useEffect(() => {
    // Priority: tab URL > config URL > existing URL
    if (meetingTabUrl && meetingUrl !== meetingTabUrl) {
      setMeetingUrl(meetingTabUrl)
    } else if (config.callUrl && !meetingUrl) {
      setMeetingUrl(config.callUrl)
    }
  }, [meetingTabUrl, config.callUrl, meetingUrl, setMeetingUrl])

  const handleJoinMeeting = useCallback(async () => {
    if (!meetingUrl.trim()) {
      setJoinError('Please enter a Teams meeting URL')
      return
    }

    if (!isLikelyTeamsUrl(meetingUrl)) {
      setJoinError('That does not look like a Teams meeting link')
      return
    }

    setIsJoining(true)
    setJoinError(null)
    addLog('Generating ACS token...', 'info')

    try {
      const readinessIssue = providerReadiness()
      if (readinessIssue) {
        setJoinError(readinessIssue)
        addLog(readinessIssue, 'error')
        setIsJoining(false)
        return
      }

      // Generate token from access key
      const { token } = await getOrCreateToken(config.endpoint, config.accessKey)
      addLog('Token generated successfully', 'success')
      
      // Determine the agent display name to use
      const agentNameToUse = meetingAgentName || 'AI Agent'
      
      // Also update the store for other components to use
      if (meetingAgentName) {
        setDisplayName(meetingAgentName)
      }
      
      // Initialize ACS with the real token and agent name (hook handles re-init if name changed)
      addLog(`Initializing call client as "${agentNameToUse}"...`, 'info')
      const initSuccess = await initializeAcs(token, agentNameToUse)
      if (!initSuccess) {
        throw new Error('Failed to initialize call client')
      }

      addLog('Joining Teams meeting...', 'info')
      const success = await joinMeeting(meetingUrl)
      
      if (success) {
        startCall()
        addLog('✓ Call initiated, waiting to connect...', 'success')
        // Don't navigate here - let the call state handler navigate when Connected
      } else {
        throw new Error('Failed to join meeting')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join meeting'
      setJoinError(message)
      addLog(`✗ Join failed: ${message}`, 'error')
    } finally {
      setIsJoining(false)
    }
  }, [meetingUrl, meetingAgentName, config.endpoint, config.accessKey, setDisplayName, initializeAcs, joinMeeting, startCall, addLog])

  const handleCopilotSignIn = useCallback(async () => {
    addLog('Starting Copilot Studio sign-in...', 'info')
    await startAuth()
  }, [addLog, startAuth])

  const handleCancelSignIn = useCallback(() => {
    cancelAuth()
    addLog('Sign-in cancelled', 'info')
  }, [cancelAuth, addLog])

  const copyDeviceCode = useCallback(() => {
    copyUserCode()
    addLog('Device code copied to clipboard', 'info')
  }, [copyUserCode, addLog])

  const handleOpenVerification = useCallback(() => {
    openVerificationUrl()
  }, [openVerificationUrl])

  return (
    <div className="flex items-start justify-center h-full p-6 md:p-10">
      <div className="w-full max-w-5xl space-y-5">
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Setup • Join a Teams meeting</p>
              <p className="text-xs text-muted-foreground">Paste the invite link, validate it, then connect your Copilot agent.</p>
            </div>
          </div>
          {/* Suppress duplicate status badge; global header already shows lobby/connected */}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
        {/* Join Meeting Card */}
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-success/10">
                    <Phone className="w-5 h-5 text-success" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle>Join Meeting</CardTitle>
                    <CardDescription>Paste a Teams invite and join in one click</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="gap-1 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  ACS token on-demand
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meetingUrl">Teams Meeting URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="meetingUrl"
                    type="text"
                    placeholder="https://teams.microsoft.com/l/meetup-join/..."
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    disabled={isJoining}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={pasteFromClipboard} title="Paste from clipboard">
                    <Clipboard className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setMeetingUrl('')} title="Clear">
                    <Eraser className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Use a standard Teams invite link. We’ll validate the URL before joining.</p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant={isLikelyTeamsUrl(meetingUrl || '') ? 'secondary' : 'outline'}>Link check</Badge>
                <Badge variant="outline">Token ready on join</Badge>
                <Badge variant="outline">No meeting pre-join UI</Badge>
              </div>

              <Button
                onClick={handleJoinMeeting}
                disabled={isJoining || !meetingUrl.trim() || connectionStatus === 'connecting' || connectionStatus === 'in-lobby'}
                variant="default"
                className="w-full"
              >
                {connectionStatus === 'in-lobby' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Waiting in Lobby...
                  </>
                ) : connectionStatus === 'connecting' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Phone className="w-4 h-4 mr-2" />
                    Join Meeting
                  </>
                )}
              </Button>

              {joinError && (
                <p className="text-sm text-destructive">{joinError}</p>
              )}
            </CardContent>
          </Card>

        {/* Copilot Studio Card (only when provider is Copilot Studio) */}
        {isCopilotStudio && (
          <Card className="h-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <CardTitle>Copilot Studio Agent</CardTitle>
                <CardDescription>Sign in to enable AI-powered responses</CardDescription>
              </div>
              {auth.isAuthenticated && (
                <Badge variant="success">Connected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Not authenticated, no device code */}
            {!isAuthenticated && !deviceCode && (
              <Button
                onClick={handleCopilotSignIn}
                disabled={isAuthenticating}
                className="w-full"
              >
                {isAuthenticating ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Starting sign-in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In to Copilot Studio
                  </>
                )}
              </Button>
            )}

            {/* Device code panel */}
            {deviceCode && !isAuthenticated && (
              <div className="space-y-4 p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">
                  Go to{' '}
                  <button
                    onClick={handleOpenVerification}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    microsoft.com/devicelogin
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </p>
                
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-2xl font-mono font-bold text-center py-3 px-4 bg-background rounded-md border">
                    {deviceCode.userCode}
                  </code>
                  <Button variant="outline" size="icon" onClick={copyDeviceCode}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground text-center">
                  Enter this code to sign in
                </p>

                <Button variant="outline" onClick={handleCancelSignIn} className="w-full">
                  <X className="w-4 h-4 mr-2" />
                  Cancel Sign-In
                </Button>
              </div>
            )}

            {/* Authenticated */}
            {isAuthenticated && auth.account && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10">
                <CheckCircle className="w-5 h-5 text-success" />
                <div>
                  <p className="font-medium">{auth.account.name}</p>
                  <p className="text-sm text-muted-foreground">{auth.account.username}</p>
                </div>
              </div>
            )}

            {authState === 'error' && (
              <p className="text-sm text-destructive">Authentication failed. Please try again.</p>
            )}
          </CardContent>
        </Card>
        )}
        </div>
      </div>
    </div>
  )
}
