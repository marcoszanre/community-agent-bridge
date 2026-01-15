import { useState, useEffect } from 'react'
import { useNavigationStore } from '@/stores/navigationStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { 
  BookOpen, 
  Bot, 
  Key, 
  Cloud, 
  Zap, 
  Hand, 
  Shield,
  Volume2,
  MessageSquare,
  ExternalLink,
  Sparkles,
  CheckCircle2
} from 'lucide-react'

export function HelpPage() {
  const { scrollToSection, clearScrollSection } = useNavigationStore()
  const [activeTab, setActiveTab] = useState(() => 
    scrollToSection === 'concepts' ? 'concepts' : 'agents'
  )

  // Handle navigation to specific section/tab
  useEffect(() => {
    if (!scrollToSection) return

    if (scrollToSection === 'concepts') {
      setActiveTab('concepts')
    }

    clearScrollSection()
  }, [scrollToSection, clearScrollSection])

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b bg-background/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Help & Documentation</h1>
            <p className="text-xs text-muted-foreground">Setup guides, concepts, and reference documentation</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-8 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList>
              <TabsTrigger value="agents">Agent Setup</TabsTrigger>
              <TabsTrigger value="concepts">App Concepts</TabsTrigger>
            </TabsList>

            {/* Agent Setup Guides */}
            <TabsContent value="agents" className="space-y-6">
              {/* Copilot Studio Authenticated */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      Copilot Studio (Authenticated)
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">OAuth2</Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Microsoft 365 authentication with device code flow
                  </CardDescription>
                </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Prerequisites</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Microsoft Copilot Studio account</li>
                        <li>Published agent/bot in Copilot Studio</li>
                        <li>Microsoft 365 account for authentication</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Setup Steps</h4>
                      <ol className="text-sm text-muted-foreground space-y-2">
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">1.</span>
                          <span>Go to <strong>Settings → Agents</strong> tab</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">2.</span>
                          <span>Click <strong>Add Agent → Copilot Studio</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">3.</span>
                          <span>Fill in the required fields:</span>
                        </li>
                        <ul className="ml-6 space-y-1 list-disc">
                          <li><strong>Bot ID:</strong> From Copilot Studio → Settings → Channels → Copy Bot ID</li>
                          <li><strong>Tenant ID:</strong> Your Azure AD tenant ID (Directory ID)</li>
                          <li><strong>Client ID:</strong> App registration client ID from Azure AD</li>
                          <li><strong>Environment ID:</strong> Power Platform environment ID</li>
                        </ul>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">4.</span>
                          <span>Click <strong>Validate</strong> to test the configuration</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">5.</span>
                          <span>A device code prompt will appear - sign in with your Microsoft 365 account</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">6.</span>
                          <span>Once validated, click <strong>Add Agent</strong></span>
                        </li>
                      </ol>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                      <p className="text-sm text-blue-900 dark:text-blue-100">
                        <strong>Note:</strong> You'll need to sign in each time you start the app. Your credentials are never stored locally.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Copilot Studio Anonymous */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        Copilot Studio (Anonymous)
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">Direct Line</Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Direct Line secret authentication - no user login required
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Prerequisites</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Microsoft Copilot Studio account</li>
                        <li>Published agent/bot in Copilot Studio</li>
                        <li>Direct Line channel enabled</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Setup Steps</h4>
                      <ol className="text-sm text-muted-foreground space-y-2">
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">1.</span>
                          <span>In Copilot Studio, go to <strong>Settings → Security → Web channel security</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">2.</span>
                          <span>Copy the <strong>Secret</strong> (starts with your bot name)</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">3.</span>
                          <span>In Community Agent Bridge: <strong>Settings → Agents → Add Agent → Copilot Studio (Anonymous)</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">4.</span>
                          <span>Enter the Direct Line secret</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">5.</span>
                          <span>Click <strong>Validate</strong> then <strong>Add Agent</strong></span>
                        </li>
                      </ol>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-3">
                      <p className="text-sm text-green-900 dark:text-green-100">
                        <strong>Best for:</strong> Scenarios where you don't need user-specific authentication. The secret is stored locally and encrypted.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Azure AI Foundry */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Cloud className="w-4 h-4" />
                        Azure AI Foundry
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">Service Principal</Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Service principal authentication for Azure-hosted agents
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Prerequisites</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Azure subscription</li>
                        <li>Azure AI Foundry project with deployed agent</li>
                        <li>Azure AD App Registration (service principal)</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Step 1: Create App Registration</h4>
                      <ol className="text-sm text-muted-foreground space-y-2">
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">1.</span>
                          <span>Azure Portal → <strong>Azure Active Directory → App registrations → New registration</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">2.</span>
                          <span>Name it (e.g., "Community Agent Bridge - Foundry")</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">3.</span>
                          <span>Leave redirect URI blank → Click <strong>Register</strong></span>
                        </li>
                      </ol>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Step 2: Get Credentials</h4>
                      <ul className="text-sm text-muted-foreground space-y-2 ml-2">
                        <li><strong>Tenant ID:</strong> Azure AD overview → Copy Tenant ID</li>
                        <li><strong>Client ID:</strong> App Registration overview → Copy Application (client) ID</li>
                        <li><strong>Client Secret:</strong> App Registration → Certificates & secrets → New client secret → Copy Value (save immediately!)</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Step 3: Grant Permissions</h4>
                      <ol className="text-sm text-muted-foreground space-y-2">
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">1.</span>
                          <span>Go to your <strong>Azure AI Foundry project</strong> (not the Hub)</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">2.</span>
                          <span><strong>Access control (IAM) → Add → Add role assignment</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">3.</span>
                          <span>Select role: <strong>Azure AI User</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">4.</span>
                          <span>Select your app registration → Review + assign</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">5.</span>
                          <span>Wait 1-2 minutes for permissions to propagate</span>
                        </li>
                      </ol>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Step 4: Configure in App</h4>
                      <ol className="text-sm text-muted-foreground space-y-2">
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">1.</span>
                          <span><strong>Settings → Agents → Add Agent → Azure AI Foundry</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">2.</span>
                          <span>Enter all credentials and agent details</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">3.</span>
                          <span>Click <strong>Validate</strong> to test OAuth2 authentication</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-medium text-primary">4.</span>
                          <span>Once validated, click <strong>Add Agent</strong></span>
                        </li>
                      </ol>
                    </div>

                    <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 rounded-lg p-3 space-y-2">
                      <p className="text-sm text-purple-900 dark:text-purple-100">
                        <strong>Required Role:</strong> Azure AI User (includes agent read/invoke permissions)
                      </p>
                      <p className="text-sm text-purple-900 dark:text-purple-100">
                        <strong>OAuth2 Scope:</strong> https://ai.azure.com/.default
                      </p>
                    </div>

                    <a 
                      href="https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/rbac-foundry"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Microsoft Foundry RBAC Documentation
                    </a>
                  </CardContent>
                </Card>
            </TabsContent>

            {/* App Concepts */}
            <TabsContent value="concepts" className="space-y-6">
              {/* Behavior Patterns */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Behavior Patterns
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Control how your agent responds in meetings
                  </CardDescription>
                </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      {/* Auto Pattern */}
                      <div className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-blue-500" />
                            <h4 className="font-semibold text-sm">Auto (Recommended)</h4>
                          </div>
                          <Badge variant="default" className="text-[10px]">Default</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          The agent responds using the same channel it was triggered from. When mentioned in voice (captions), it speaks back. When mentioned in chat, it replies in chat.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium">Voice trigger:</span> Speaks back
                          </div>
                          <div>
                            <span className="font-medium">Chat trigger:</span> Chat reply
                          </div>
                        </div>
                      </div>

                      {/* Raise Hand Pattern */}
                      <div className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Hand className="w-4 h-4 text-amber-500" />
                          <h4 className="font-semibold text-sm">Raise Hand</h4>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          The agent queues its response and raises its hand in Teams, waiting for acknowledgment before speaking. Great for formal meetings.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium">Voice trigger:</span> Queues + raises hand
                          </div>
                          <div>
                            <span className="font-medium">Chat trigger:</span> Chat reply
                          </div>
                        </div>
                      </div>

                      {/* Review Pattern */}
                      <div className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-green-500" />
                          <h4 className="font-semibold text-sm">Review</h4>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          The agent prepares responses but waits for manual approval before sending them. You control exactly what the agent says.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium">Voice trigger:</span> Requires approval
                          </div>
                          <div>
                            <span className="font-medium">Chat trigger:</span> Requires approval
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Preprocessing */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Preprocessing
                    </CardTitle>
                    <CardDescription className="text-xs">
                      How messages are prepared before sending to the agent
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Preprocessing cleans and formats captions before sending them to your AI agent:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                      <li><strong>Caption aggregation:</strong> Combines partial captions into complete sentences</li>
                      <li><strong>Agent name detection:</strong> Identifies when the agent is mentioned</li>
                      <li><strong>Context extraction:</strong> Extracts the actual question/request after the mention</li>
                      <li><strong>Duplicate filtering:</strong> Prevents sending the same question twice</li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Postprocessing */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Volume2 className="w-4 h-4" />
                      Postprocessing & TTS Optimization
                    </CardTitle>
                    <CardDescription className="text-xs">
                      How agent responses are prepared for text-to-speech
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Postprocessing optimizes agent responses for natural speech:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                      <li><strong>Link formatting:</strong> Converts URLs to "link available in chat"</li>
                      <li><strong>Markdown cleanup:</strong> Removes markdown formatting for cleaner speech</li>
                      <li><strong>Emoji handling:</strong> Converts or removes emojis</li>
                      <li><strong>Number formatting:</strong> Spells out numbers for better pronunciation</li>
                      <li><strong>SSML injection:</strong> Adds speech synthesis markup for natural pacing</li>
                    </ul>
                    <div className="bg-muted rounded-lg p-3 text-sm font-mono">
                      <div className="text-muted-foreground">Example:</div>
                      <div className="mt-1">"Check https://example.com for details 🎉"</div>
                      <div className="text-muted-foreground mt-2">Becomes:</div>
                      <div className="mt-1">"Check the link available in chat for details"</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Validation & Testing */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Validation & Testing
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Test your agent configurations before meetings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Each agent configuration includes validation tools:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                      <li><strong>Test Connection:</strong> Verifies authentication and credentials</li>
                      <li><strong>Smoke Test:</strong> Sends a test message and shows the response</li>
                      <li><strong>Service-specific checks:</strong>
                        <ul className="ml-6 mt-1 space-y-1">
                          <li>OAuth2 token acquisition (Copilot Studio, Azure Foundry)</li>
                          <li>Direct Line token exchange (Anonymous)</li>
                          <li>Agent retrieval and permissions (Azure Foundry)</li>
                        </ul>
                      </li>
                    </ul>
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                      <p className="text-sm text-blue-900 dark:text-blue-100">
                        <strong>Tip:</strong> Always validate after creating or editing an agent to ensure it works before joining a meeting.
                      </p>
                    </div>
                  </CardContent>
                </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  )
}
