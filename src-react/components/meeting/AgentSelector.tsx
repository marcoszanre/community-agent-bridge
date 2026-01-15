import { useCallback } from 'react'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { useAgentBehaviorStore } from '@/stores/agentBehaviorStore'
import { useTabsStore, selectActiveTab } from '@/stores/tabsStore'
import { useCopilotAuth } from '@/hooks/useCopilotAuth'
import { useConfigStore } from '@/stores/configStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { 
  Bot, Check, Zap,
  ChevronDown, ChevronUp, Loader2, LogIn,
  Copy, ExternalLink, User, Shield, Hand
} from 'lucide-react'
import type { AgentProviderConfig, MeetingTab } from '@/types'

// Simplified behavior options for users
interface SimpleBehaviorOption {
  id: string
  name: string
  description: string
  icon: React.ElementType
  recommended?: boolean
}

const BEHAVIOR_OPTIONS: SimpleBehaviorOption[] = [
  {
    id: 'autonomous-mixed',
    name: 'Auto',
    description: 'Responds naturally to voice and chat',
    icon: Zap,
    recommended: true
  },
  {
    id: 'polite-queue-mixed',
    name: 'Raise Hand',
    description: 'Raises hand before speaking',
    icon: Hand
  },
  {
    id: 'supervised',
    name: 'Review',
    description: 'Responses need your approval',
    icon: Shield
  }
]

interface AgentSelectorProps {
  tabId: string
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export function AgentSelector({ tabId, isExpanded = true, onToggleExpand }: AgentSelectorProps) {
  const providers = useAgentProvidersStore((state) => state.providers)
  const instances = useAgentProvidersStore((state) => state.getInstancesForMeeting(tabId))
  const initializeInstance = useAgentProvidersStore((state) => state.initializeInstance)
  const setInstanceAuth = useAgentProvidersStore((state) => state.setInstanceAuth)
  const setInstanceStatus = useAgentProvidersStore((state) => state.setInstanceStatus)
  
  // Behavior patterns
  const { currentPatternId, setCurrentPattern } = useAgentBehaviorStore()
  
  const activeTab = useTabsStore(selectActiveTab)
  const setMeetingAgent = useTabsStore((state) => state.setMeetingAgent)
  
  const setSpeechConfig = useConfigStore((state) => state.setSpeechConfig)
  
  const meetingTab = activeTab?.type === 'meeting' ? activeTab as MeetingTab : null

  // Copilot Auth hook - we'll use this for Copilot Studio providers
  const { 
    startAuth, 
    cancelAuth, 
    openVerificationUrl, 
    copyUserCode,
    deviceCode, 
    isAuthenticated, 
    isAuthenticating 
  } = useCopilotAuth()

  const handleSelectProvider = useCallback((providerId: string) => {
    if (!meetingTab) return
    
    // Initialize instance if not exists
    if (!instances[providerId]) {
      initializeInstance(tabId, providerId)
    }
    
    // Get the provider's configured display name and voice
    const provider = providers.find(p => p.id === providerId)
    let displayName = meetingTab.agentName // fallback to current
    
    if (provider) {
      if (provider.type === 'copilot-studio' && provider.settings.botName) {
        displayName = provider.settings.botName
      } else if (provider.type === 'copilot-studio-anon' && provider.settings.botName) {
        displayName = provider.settings.botName
      } else if (provider.type === 'azure-foundry' && provider.settings.displayName) {
        displayName = provider.settings.displayName
      } else {
        // Use provider name as fallback
        displayName = provider.name
      }
      
      // Update speech config with agent's voice
      if (provider.voiceName) {
        setSpeechConfig({ voiceName: provider.voiceName })
      }
    }
    
    // Update the meeting tab's active provider and display name
    setMeetingAgent(tabId, displayName, providerId)
  }, [meetingTab, instances, providers, tabId, initializeInstance, setMeetingAgent, setSpeechConfig])

  const handleStartAuth = useCallback(async (providerId: string) => {
    setInstanceStatus(tabId, providerId, 'authenticating')
    await startAuth()
  }, [tabId, setInstanceStatus, startAuth])

  // Sync auth state to instance
  const activeProviderId = meetingTab?.activeProviderId
  if (activeProviderId && isAuthenticated && instances[activeProviderId]) {
    const instance = instances[activeProviderId]
    if (!instance.auth?.isAuthenticated) {
      setInstanceAuth(tabId, activeProviderId, { isAuthenticated: true })
      setInstanceStatus(tabId, activeProviderId, 'connected')
    }
  }

  if (!meetingTab) return null

  return (
    <Card className="border-primary/20">
      <CardHeader 
        className={cn(
          "pb-2 cursor-pointer hover:bg-muted/50 transition-colors",
          onToggleExpand && "select-none"
        )}
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Agent Configuration
          </CardTitle>
          <div className="flex items-center gap-2">
            {meetingTab.activeProviderId && (
              <Badge variant="outline" className="text-xs">
                {providers.find(p => p.id === meetingTab.activeProviderId)?.name || 'Unknown'}
              </Badge>
            )}
            {onToggleExpand && (
              isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Agent Behavior Pattern - Visual Cards */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Agent Behavior
            </Label>
            <div className="space-y-2">
              {BEHAVIOR_OPTIONS.map((option) => {
                const Icon = option.icon
                const isSelected = currentPatternId === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => setCurrentPattern(option.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all",
                      isSelected 
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-1.5 rounded-md",
                        isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-medium text-sm",
                            isSelected && "text-primary"
                          )}>{option.name}</span>
                          {option.recommended && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Recommended
                            </Badge>
                          )}
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-primary ml-auto" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Agent Provider</Label>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {providers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No agent providers configured
                  </p>
                ) : (
                  providers.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      agentName={meetingTab.agentName}
                      isSelected={meetingTab.activeProviderId === provider.id}
                      onSelect={() => handleSelectProvider(provider.id)}
                      onStartAuth={() => handleStartAuth(provider.id)}
                      deviceCode={deviceCode}
                      isAuthenticating={isAuthenticating && meetingTab.activeProviderId === provider.id}
                      isAuthenticated={isAuthenticated}
                      onCancelAuth={cancelAuth}
                      onOpenVerification={openVerificationUrl}
                      onCopyCode={copyUserCode}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

interface ProviderCardProps {
  provider: AgentProviderConfig
  agentName: string
  isSelected: boolean
  onSelect: () => void
  onStartAuth: () => void
  deviceCode: { userCode: string } | null
  isAuthenticating: boolean
  isAuthenticated: boolean
  onCancelAuth: () => void
  onOpenVerification: () => void
  onCopyCode: () => void
}

function ProviderCard({
  provider,
  agentName,
  isSelected,
  onSelect,
  onStartAuth,
  deviceCode,
  isAuthenticating,
  isAuthenticated,
  onCancelAuth,
  onOpenVerification,
  onCopyCode
}: ProviderCardProps) {
  const needsAuth = provider.authType === 'microsoft-device-code'
  const isProviderAuthenticated = isSelected && isAuthenticated

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-all cursor-pointer",
        isSelected 
          ? "border-primary bg-primary/5" 
          : "border-border hover:border-primary/50 hover:bg-muted/30"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            provider.type === 'copilot-studio' ? "bg-blue-500/10" : "bg-purple-500/10"
          )}>
            <Bot className={cn(
              "w-4 h-4",
              provider.type === 'copilot-studio' ? "text-blue-500" : "text-purple-500"
            )} />
          </div>
          <div>
            <p className="font-medium text-sm">{provider.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {provider.type.replace('-', ' ')}
            </p>
            {/* Show agent display name under provider when selected */}
            {isSelected && agentName && (
              <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3" />
                {agentName}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {provider.isDefault && (
            <Badge variant="secondary" className="text-xs">Default</Badge>
          )}
          {isSelected && (
            <Check className="w-4 h-4 text-primary" />
          )}
        </div>
      </div>

      {/* Auth section for selected provider that needs auth */}
      {isSelected && needsAuth && !isProviderAuthenticated && (
        <div className="mt-3 pt-3 border-t border-border/50">
          {isAuthenticating && deviceCode ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Enter this code at microsoft.com/devicelogin:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-lg font-mono font-bold text-center py-2 px-3 bg-background rounded-md border">
                  {deviceCode.userCode}
                </code>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onCopyCode() }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  className="flex-1" 
                  onClick={(e) => { e.stopPropagation(); onOpenVerification() }}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Open
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); onCancelAuth() }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full"
              onClick={(e) => { e.stopPropagation(); onStartAuth() }}
              disabled={isAuthenticating}
            >
              {isAuthenticating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4 mr-2" />
              )}
              Sign In
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentSelector
