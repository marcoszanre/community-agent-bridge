import { useState, useEffect } from 'react'
import { useTabsStore, selectMeetingTabs } from '@/stores/tabsStore'
import { useConfigStore } from '@/stores/configStore'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { useAgentBehaviorStore } from '@/stores/agentBehaviorStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { useAppStore } from '@/stores/appStore'
import { useCopilotAuth } from '@/hooks/useCopilotAuth'
import { getOrCreateToken } from '@/services/tokenService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Phone, Video, Clock, Calendar,
  Plus, History, Bot,
  Loader2, LogIn, X, Copy, ExternalLink, 
  Sparkles, ArrowRight, FileText,
  Zap, Shield, Hand, HelpCircle, AlertCircle
} from 'lucide-react'
import type { MeetingInfo } from '@/types'

// Simplified behavior options with icons
const BEHAVIOR_OPTIONS = [
  { id: 'autonomous-mixed', name: 'Auto', icon: Zap, description: 'Responds naturally', recommended: true },
  { id: 'polite-queue-mixed', name: 'Raise Hand', icon: Hand, description: 'Waits for turn' },
  { id: 'supervised', name: 'Review', icon: Shield, description: 'Needs approval' }
]

const getProviderTypeLabel = (type: string) => {
  if (type === 'copilot-studio') return 'CPS Auth'
  if (type === 'copilot-studio-anon') return 'CPS Anon'
  if (type === 'azure-foundry') return 'Foundry'
  return ''
}

export function HomeTab() {
  const { config, setSpeechConfig } = useConfigStore()
  const { addLog } = useAppStore()
  const { preferences, setDefaultAgentName, setDefaultProviderId, setDefaultVoice } = usePreferencesStore()
  const providers = useAgentProvidersStore((state) => state.providers)
  const getDefaultProvider = useAgentProvidersStore((state) => state.getDefaultProvider)
  const { currentPatternId, setCurrentPattern } = useAgentBehaviorStore()
  const setPage = useNavigationStore((state) => state.setPage)
  
  const meetingTabs = useTabsStore(selectMeetingTabs)
  const meetingHistory = useTabsStore((state) => state.meetingHistory)
  const createMeetingTab = useTabsStore((state) => state.createMeetingTab)
  const reopenMeeting = useTabsStore((state) => state.reopenMeeting)
  const setActiveTab = useTabsStore((state) => state.setActiveTab)

  const [meetingUrl, setMeetingUrl] = useState(config.callUrl || '')
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    // Only use preferences.defaultProviderId if it exists in the providers list
    const preferredExists = preferences.defaultProviderId && providers.some(p => p.id === preferences.defaultProviderId)
    if (preferredExists) return preferences.defaultProviderId!
    
    const defaultProvider = getDefaultProvider()
    return defaultProvider?.id || ''
  })
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId)
  const selectedProviderTypeLabel = selectedProvider ? getProviderTypeLabel(selectedProvider.type) : ''

  const selectedProviderDisplayName = (() => {
    if (!selectedProvider) return preferences.defaultAgentName || 'Not configured'

    if (selectedProvider.type === 'copilot-studio' && selectedProvider.settings.botName) {
      return selectedProvider.settings.botName
    }
    if (selectedProvider.type === 'copilot-studio-anon' && selectedProvider.settings.botName) {
      return selectedProvider.settings.botName
    }
    if (selectedProvider.type === 'azure-foundry' && selectedProvider.settings.displayName) {
      return selectedProvider.settings.displayName
    }

    return selectedProvider.name
  })()

  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId)
    setDefaultProviderId(providerId)

    const provider = providers.find((p) => p.id === providerId)
    if (provider) {
      if (provider.voiceName) {
        setDefaultVoice(provider.voiceName)
        setSpeechConfig({ voiceName: provider.voiceName })
      }

      const name = (() => {
        if (provider.type === 'copilot-studio' && provider.settings.botName) return provider.settings.botName
        if (provider.type === 'copilot-studio-anon' && provider.settings.botName) return provider.settings.botName
        if (provider.type === 'azure-foundry' && provider.settings.displayName) return provider.settings.displayName
        return provider.name
      })()

      if (name) {
        setDefaultAgentName(name)
      }
    }
  }

  // Auth hook
  const { 
    startAuth, 
    cancelAuth, 
    openVerificationUrl, 
    copyUserCode,
    deviceCode, 
    isAuthenticated, 
    isAuthenticating 
  } = useCopilotAuth()

  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinBusy, setJoinBusy] = useState(false)

  const providerReadiness = () => {
    if (!selectedProvider) return 'Select a provider before joining'

    const type = selectedProvider.type
    const s = selectedProvider.settings as Record<string, string | undefined>

    if (type === 'copilot-studio') {
      if (!s.clientId || !s.tenantId || !s.environmentId || !s.botId) return 'Copilot Studio needs clientId, tenantId, environmentId, and botId'
    } else if (type === 'copilot-studio-anon') {
      if (!s.directLineSecret) return 'Copilot Anon needs a Direct Line secret'
    } else if (type === 'azure-foundry') {
      if (!s.projectEndpoint || !s.clientId || !s.clientSecret || !s.tenantId) return 'Foundry needs endpoint, tenant, clientId, and clientSecret'
    }

    return null
  }

  const runReadinessCheck = async () => {
    const readinessIssue = providerReadiness()
    if (readinessIssue) {
      setJoinError(readinessIssue)
      addLog(readinessIssue, 'error')
      return false
    }

    if (!config.endpoint || !config.accessKey) {
      const msg = 'ACS endpoint/access key missing in config'
      setJoinError(msg)
      addLog(msg, 'error')
      return false
    }

    try {
      setJoinError(null)
      // Pre-flight ACS token to ensure first-run success
      await getOrCreateToken(config.endpoint, config.accessKey)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get ACS token'
      setJoinError(msg)
      addLog(msg, 'error')
      return false
    }
  }

  // Sync from config
  useEffect(() => {
    if (config.callUrl && !meetingUrl) {
      setMeetingUrl(config.callUrl)
    }
  }, [config.callUrl])

  // Keep the selected provider in sync with preferences and available providers
  useEffect(() => {
    const preferred = preferences.defaultProviderId
      ? providers.find((p) => p.id === preferences.defaultProviderId)
      : undefined
    const fallback = getDefaultProvider()
    const currentExists = selectedProviderId && providers.some((p) => p.id === selectedProviderId)

    if (!currentExists) {
      // Set to preferred or fallback provider, or clear if none exist
      setSelectedProviderId((preferred || fallback)?.id || '')
    }
  }, [preferences.defaultProviderId, providers, selectedProviderId, getDefaultProvider])

  const handleJoinNewMeeting = async () => {
    if (!meetingUrl.trim()) return
    setJoinBusy(true)

    // Check for active meetings - ACS can only handle one session at a time
    const activeMeeting = meetingTabs.find(t => t.stage === 'connect' || t.stage === 'meeting')
    if (activeMeeting) {
      addLog('Cannot join: another meeting is active. Please leave the current meeting first.', 'error')
      setJoinBusy(false)
      return
    }

    const ready = await runReadinessCheck()
    if (!ready) {
      setJoinBusy(false)
      return
    }

    // Use the computed display name from the selected provider, not the preference
    const agentNameToUse = selectedProviderDisplayName || preferences.defaultAgentName || 'AI Agent'
    const tabId = createMeetingTab({
      meetingUrl: meetingUrl.trim(), 
      meetingTitle: extractMeetingName(meetingUrl),
      agentName: agentNameToUse,
      activeProviderId: selectedProviderId || null
    })
    setActiveTab(tabId)
    setJoinBusy(false)
  }

  const handleReopenMeeting = async (meeting: MeetingInfo) => {
    // Check for active meetings - ACS can only handle one session at a time
    const activeMeeting = meetingTabs.find(t => t.stage === 'connect' || t.stage === 'meeting')
    if (activeMeeting) {
      addLog('Cannot join: another meeting is active. Please leave the current meeting first.', 'error')
      return
    }

    const ready = await runReadinessCheck()
    if (!ready) return

    const agentNameToUse = selectedProviderDisplayName || preferences.defaultAgentName || 'AI Agent'
    const tabId = reopenMeeting(
      meeting.id,
      agentNameToUse,
      selectedProviderId || null
    )
    if (tabId) {
      setActiveTab(tabId)
    }
  }

  const handleSwitchToMeeting = (tabId: string) => {
    setActiveTab(tabId)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-b from-background to-background/95">
      {/* Main Content - Full Width */}
      <div className="flex-1 overflow-auto">
        <div className="w-full px-6 py-6">
          {/* Auth Banner - Only for Copilot Studio provider */}
          {selectedProvider?.type === 'copilot-studio' && !isAuthenticated && (
            <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="py-4">
                {isAuthenticating && deviceCode ? (
                  <div className="flex items-center gap-6">
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-1">Complete sign-in to enable AI assistance</p>
                      <p className="text-xs text-muted-foreground">Enter this code at the Microsoft sign-in page</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="px-4 py-2 bg-background rounded-lg border-2 border-dashed border-primary/30">
                        <code className="text-2xl font-mono font-bold tracking-widest text-primary">
                          {deviceCode.userCode}
                        </code>
                      </div>
                      <Button variant="ghost" size="icon" onClick={copyUserCode} className="h-9 w-9">
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={openVerificationUrl} size="sm">
                        <ExternalLink className="w-3 h-3 mr-2" />
                        Open Sign-in
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelAuth}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <LogIn className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Connect to Copilot Studio</p>
                        <p className="text-xs text-muted-foreground">Sign in to enable AI-powered responses in meetings</p>
                      </div>
                    </div>
                    <Button onClick={startAuth} disabled={isAuthenticating}>
                      {isAuthenticating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Connect AI
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Main Grid - 3 Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Join Meeting Panel - Takes 2 columns */}
            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Plus className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">Join New Meeting</h2>
                      <p className="text-xs text-muted-foreground">Enter your Teams meeting details</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* Meeting URL */}
                    <div className="space-y-2">
                      <Label htmlFor="meetingUrl" className="text-sm font-medium">Teams Meeting Link</Label>
                      <div className="flex gap-2">
                        <Input
                          id="meetingUrl"
                          placeholder="Paste your Teams meeting URL here..."
                          value={meetingUrl}
                          onChange={(e) => setMeetingUrl(e.target.value)}
                          className="h-11 font-mono text-sm flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11 shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(meetingUrl)
                          }}
                          disabled={!meetingUrl}
                          title="Copy meeting link"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Agent Provider */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">AI Agent</Label>
                      <Select 
                        value={selectedProviderId} 
                        valueText={selectedProvider?.name || ''}
                        onValueChange={handleProviderChange}
                      >
                        <SelectTrigger className="h-11">
                          {selectedProvider ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{selectedProvider.name}</span>
                              {selectedProviderTypeLabel && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{selectedProviderTypeLabel}</Badge>
                              )}
                              {selectedProvider.isDefault && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>
                              )}
                            </div>
                          ) : (
                            <SelectValue placeholder="Select an AI agent" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {providers.map((provider) => {
                            const typeLabel = getProviderTypeLabel(provider.type)
                            
                            return (
                              <SelectItem 
                                key={provider.id} 
                                value={provider.id}
                                textValue={provider.name}
                              >
                                <div className="flex items-center gap-2">
                                  <Bot className="w-4 h-4 text-primary" />
                                  <span className="font-medium">{provider.name}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{typeLabel}</Badge>
                                  {provider.isDefault && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                      {selectedProvider && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          Display name: <span className="font-medium text-foreground">{selectedProviderDisplayName}</span>
                        </p>
                      )}
                    </div>

                    {/* Agent Behavior Pattern */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Behavior Pattern</Label>
                        <button 
                          onClick={() => setPage('help', 'concepts')}
                          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                        >
                          <HelpCircle className="w-3 h-3" />
                          Learn more
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {BEHAVIOR_OPTIONS.map((option) => {
                          const isSelected = currentPatternId === option.id
                          const Icon = option.icon
                          return (
                            <button
                              key={option.id}
                              onClick={() => setCurrentPattern(option.id)}
                              className={`relative flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-center ${
                                isSelected 
                                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30' 
                                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                              }`}
                              title={option.description}
                            >
                              {option.recommended && (
                                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                                  <Sparkles className="w-2 h-2 text-primary-foreground" />
                                </span>
                              )}
                              <Icon className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className={`text-xs font-medium ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                                {option.name}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Active Meeting Warning */}
                    {meetingTabs.some(t => t.stage === 'connect' || t.stage === 'meeting') && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="font-medium">Active meeting in progress</p>
                          <p className="text-yellow-600/80 dark:text-yellow-500/80">Please leave the current meeting before joining another</p>
                        </div>
                      </div>
                    )}

                    {/* Join Button */}
                    <Button 
                      onClick={handleJoinNewMeeting} 
                      disabled={!meetingUrl.trim() || joinBusy || meetingTabs.some(t => t.stage === 'connect' || t.stage === 'meeting')}
                      className="w-full h-12 text-base font-medium"
                      size="lg"
                    >
                      {joinBusy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Video className="w-5 h-5 mr-2" />} 
                      {joinBusy ? 'Checking readiness...' : 'Join Meeting'}
                      {!joinBusy && <ArrowRight className="w-4 h-4 ml-2" />}
                    </Button>
                    {joinError && (
                      <p className="text-xs text-destructive mt-2">{joinError}</p>
                    )}

                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Takes 1 column */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              {/* Active Meetings */}
              {meetingTabs.length > 0 && (
                <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <h3 className="text-sm font-semibold text-green-600">Active Meetings</h3>
                      <Badge variant="secondary" className="ml-auto text-xs bg-green-500/10 text-green-600">
                        {meetingTabs.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {meetingTabs.map((tab) => (
                        <div
                          key={tab.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-background/50 hover:bg-background cursor-pointer transition-all hover:shadow-sm border border-transparent hover:border-green-500/20"
                          onClick={() => handleSwitchToMeeting(tab.id)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                              <Phone className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{tab.title}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Started {formatTime(tab.joinedAt)}
                              </p>
                            </div>
                          </div>
                          <Button variant="secondary" size="sm" className="h-8 text-xs flex-shrink-0">
                            Switch
                            <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Meeting History */}
              <Card className="flex-1 flex flex-col min-h-0">
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Recent Meetings</h3>
                    </div>
                    {meetingHistory.length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPage('history')}
                      >
                        View All
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                  
                  {meetingHistory.length > 0 ? (
                    <ScrollArea className="flex-1 -mx-4 px-4">
                      <div className="space-y-2">
                        {meetingHistory.slice(0, 5).map((meeting) => (
                          <div
                            key={meeting.id}
                            className="group flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => setPage('history')}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                {meeting.summary ? (
                                  <FileText className="w-4 h-4 text-primary" />
                                ) : (
                                  <Video className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm truncate">{meeting.title}</p>
                                  {meeting.summary && (
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary">
                                      Summary
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDate(meeting.joinedAt)}</span>
                                  {meeting.duration && (
                                    <>
                                      <span>•</span>
                                      <span>{formatDuration(meeting.duration)}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleReopenMeeting(meeting)
                                }}
                              >
                                Rejoin
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <History className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No recent meetings</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Your meeting history will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper functions
function extractMeetingName(url: string): string {
  try {
    const urlObj = new URL(url)
    const params = new URLSearchParams(urlObj.search)
    const context = params.get('context')
    if (context) {
      const decoded = JSON.parse(decodeURIComponent(context))
      if (decoded?.Tid) {
        return `Meeting ${decoded.Tid.slice(0, 8)}`
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return `Meeting ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

function formatDate(date: Date): string {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) {
    return `Today ${formatTime(d)}`
  } else if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${formatTime(d)}`
  }
  return d.toLocaleDateString([], { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(mins / 60)
  
  if (hours > 0) {
    return `${hours}h ${mins % 60}m`
  }
  return `${mins}m`
}

export default HomeTab
