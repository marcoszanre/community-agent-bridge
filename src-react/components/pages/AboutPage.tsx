import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { 
  Info,
  ExternalLink,
  Monitor,
  Github
} from 'lucide-react'

export function AboutPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b bg-background/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <Info className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">About</h1>
            <p className="text-xs text-muted-foreground">Version and application information</p>
          </div>
        </div>

      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-3xl mx-auto space-y-6">
          {/* App Info Card */}
          <Card className="bg-gradient-to-br from-amber-50 via-yellow-50/50 to-amber-50/30 border-amber-200/60 dark:from-amber-950/20 dark:via-yellow-950/10 dark:to-amber-950/5 dark:border-amber-800/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-lg font-bold text-gray-900 shadow-lg flex-shrink-0 ring-2 ring-black/20 dark:ring-black/40">
                  CAB
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-3xl text-amber-500 dark:text-amber-400" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 600 }}>Community</span>
                      <span className="text-xl font-bold text-foreground italic tracking-wider">AGENT BRIDGE</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">Version 1.0.0</Badge>
                      <Badge variant="outline" className="text-[10px]">
                        <Monitor className="w-3 h-3 mr-1" />
                        Cross-platform
                      </Badge>
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A minimalistic desktop application for Azure Communication Services, enabling AI-powered agents to participate in Teams meetings. Built with Tauri for superior performance and small bundle size (3-10MB vs 150+MB).
                  </p>

                  <div className="pt-2">
                    <h3 className="text-sm font-semibold mb-2">Key Features</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• AI agents via Copilot Studio and Azure AI Foundry</li>
                      <li>• Full voice and video calling with Azure Communication Services</li>
                      <li>• Natural text-to-speech responses with Azure Speech SDK</li>
                      <li>• Customizable agent behavior patterns</li>
                      <li>• Local configuration with bring-your-own-key model</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Technology Stack */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-lg font-semibold">Built With</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Framework:</span>
                  <div className="mt-1">Tauri + React + TypeScript</div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">UI:</span>
                  <div className="mt-1">shadcn/ui + Tailwind CSS</div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">State:</span>
                  <div className="mt-1">Zustand</div>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Build:</span>
                  <div className="mt-1">Vite</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Azure Services */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-lg font-semibold">Azure Services</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="font-medium text-primary min-w-[160px]">Communication Services</span>
                  <span className="text-muted-foreground">Voice and video calling</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium text-primary min-w-[160px]">Speech Services</span>
                  <span className="text-muted-foreground">Text-to-speech synthesis</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium text-primary min-w-[160px]">Copilot Studio</span>
                  <span className="text-muted-foreground">AI agent platform</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium text-primary min-w-[160px]">AI Foundry</span>
                  <span className="text-muted-foreground">Advanced AI agent deployment</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium text-primary min-w-[160px]">Active Directory</span>
                  <span className="text-muted-foreground">OAuth2 authentication</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-lg font-semibold">Resources</h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open('https://github.com/marcoszanre/teams-agent-bridge', '_blank')}
                >
                  <Github className="w-4 h-4 mr-2" />
                  GitHub Repository
                  <ExternalLink className="w-3 h-3 ml-auto" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open('https://tauri.app/', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Tauri Documentation
                  <ExternalLink className="w-3 h-3 ml-auto" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open('https://azure.microsoft.com/services/communication-services/', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Azure Communication Services
                  <ExternalLink className="w-3 h-3 ml-auto" />
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.open('https://www.microsoft.com/microsoft-copilot/microsoft-copilot-studio', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Microsoft Copilot Studio
                  <ExternalLink className="w-3 h-3 ml-auto" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* License & Credits */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h3 className="text-lg font-semibold">License & Credits</h3>
              <p className="text-sm text-muted-foreground">
                Community Agent Bridge is built for demonstration and educational purposes. 
                All Azure services require valid credentials and subscriptions.
              </p>
              <p className="text-xs text-muted-foreground">
                © 2026 Community Agent Bridge. Built with ❤️ using open source technologies.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
