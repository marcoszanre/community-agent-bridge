import { useState, useRef, useEffect } from 'react'
import { useOnboardingStore, type OnboardingStep } from '@/stores/onboardingStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { useConfigStore } from '@/stores/configStore'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { useAgentStore } from '@/stores/agentStore'
import { useAppStore } from '@/stores/appStore'
import { 
  validateAcsConfig,
  validateSpeechConfig,
  validateCopilotStudioConfig,
  validateCopilotStudioAnonConfig,
  validateAzureFoundryConfig
} from '@/services'
import { CopilotStudioAgentProvider } from '@/providers/agent/CopilotStudioAgentProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Bot, 
  Shield, 
  Video,
  Zap,
  ChevronRight,
  PartyPopper,
  Info,
  ExternalLink,
  Mic,
  Cloud,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  LogIn
} from 'lucide-react'
import type { 
  CopilotStudioProviderConfig, 
  CopilotStudioAnonProviderConfig, 
  AzureFoundryProviderConfig,
  CopilotStudioConfig
} from '@/types'

// Step indicator component
function StepIndicator({ 
  steps, 
  currentStep 
}: { 
  steps: { id: OnboardingStep; label: string }[]
  currentStep: OnboardingStep 
}) {
  const currentIndex = steps.findIndex(s => s.id === currentStep)
  
  return (
    <div className="bg-background/95 backdrop-blur-sm border-b pb-6 mb-6">
      <div className="flex items-center justify-center gap-1">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                  transition-all duration-300 mb-2
                  ${index <= currentIndex 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                    : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {index < currentIndex ? (
                  <Check className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              <span className={`text-xs font-medium ${
                index === currentIndex ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div 
                className={`
                  w-16 h-0.5 mx-2 mb-6
                  transition-colors duration-300
                  ${index < currentIndex ? 'bg-primary' : 'bg-muted'}
                `}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Welcome step component
function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="text-center max-w-3xl mx-auto px-4">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-6">
        <Sparkles className="w-10 h-10 text-primary" />
      </div>
      
      <h1 className="text-3xl font-bold mb-3">Welcome to Community Agent Bridge</h1>
      <p className="text-muted-foreground text-lg mb-8">
        Connect AI agents to your Microsoft Teams meetings in just a few steps.
      </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <Bot className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">AI Agents</h3>
            <p className="text-xs text-muted-foreground">
              Connect Copilot Studio or Azure AI Foundry agents
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <Video className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Teams Meetings</h3>
            <p className="text-xs text-muted-foreground">
              Join any Teams meeting with AI assistance
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center">
            <Mic className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Voice Responses</h3>
            <p className="text-xs text-muted-foreground">
              AI speaks responses using Azure Speech
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={onNext} className="mx-auto">
          Get Started
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
          Skip for now — I'll configure later
        </Button>
      </div>
    </div>
  )
}

// ACS Setup step component
function AcsSetupStep({ 
  // onNext, 
  // onBack,
  // onSkip,
  onSaveRef,
  onValidatedChange
}: { 
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onSaveRef?: React.MutableRefObject<(() => Promise<void>) | undefined>
  onValidatedChange?: (isValid: boolean) => void
}) {
  const { config, setConfig, setSpeechConfig, setOpenAIConfig, validationStatuses, setValidationStatus } = useConfigStore()
  const { addLog } = useAppStore()
  
  const [acsEndpoint, setAcsEndpoint] = useState(config.endpoint || '')
  const [acsAccessKey, setAcsAccessKey] = useState(config.accessKey || '')
  const [speechKey, setSpeechKey] = useState(config.speech.key || '')
  const [speechRegion, setSpeechRegion] = useState(config.speech.region || '')
  const [connectionString, setConnectionString] = useState('')
  
  // Azure OpenAI fields - load from config
  const [openAiEndpoint, setOpenAiEndpoint] = useState(config.openai?.endpoint || '')
  const [openAiKey, setOpenAiKey] = useState(config.openai?.apiKey || '')
  const [openAiDeployment, setOpenAiDeployment] = useState(config.openai?.deployment || '')
  
  // Initialize validation status from store
  const [acsStatus, setAcsStatus] = useState<'idle' | 'validating' | 'valid' | 'error'>(
    validationStatuses.acs.isValid === true ? 'valid' : validationStatuses.acs.isValid === false ? 'error' : 'idle'
  )
  const [speechStatus, setSpeechStatus] = useState<'idle' | 'validating' | 'valid' | 'error'>(
    validationStatuses.speech.isValid === true ? 'valid' : validationStatuses.speech.isValid === false ? 'error' : 'idle'
  )
  const [openAiStatus, setOpenAiStatus] = useState<'idle' | 'validating' | 'valid' | 'error'>(
    validationStatuses.openai.isValid === true ? 'valid' : validationStatuses.openai.isValid === false ? 'error' : 'idle'
  )
  const [acsMessage, setAcsMessage] = useState<string>(validationStatuses.acs.message || '')
  const [speechMessage, setSpeechMessage] = useState<string>(validationStatuses.speech.message || '')
  const [openAiMessage, setOpenAiMessage] = useState<string>(validationStatuses.openai.message || '')

  const parseConnectionString = (connStr: string) => {
    const endpointMatch = connStr.match(/endpoint=([^;]+)/i)
    const accessKeyMatch = connStr.match(/accesskey=([^;]+)/i)
    
    if (endpointMatch) setAcsEndpoint(endpointMatch[1])
    if (accessKeyMatch) setAcsAccessKey(accessKeyMatch[1])
    
    if (endpointMatch || accessKeyMatch) {
      setConnectionString('')
    }
  }

  const validateAcs = async () => {
    if (!acsEndpoint || !acsAccessKey) return false
    setAcsStatus('validating')
    const result = await validateAcsConfig(acsEndpoint.trim(), acsAccessKey.trim())
    setAcsStatus(result.isValid ? 'valid' : 'error')
    setAcsMessage(result.message)
    setValidationStatus('acs', { isValid: result.isValid, message: result.message, lastTestedAt: new Date() })
    addLog(`ACS validation: ${result.message}`, result.isValid ? 'success' : 'error')
    return result.isValid
  }

  const validateSpeech = async () => {
    if (!speechKey || !speechRegion) return false
    setSpeechStatus('validating')
    const result = await validateSpeechConfig(speechKey.trim(), speechRegion.trim())
    const message = result.details ? `${result.message} — ${result.details}` : result.message
    setSpeechStatus(result.isValid ? 'valid' : 'error')
    setSpeechMessage(message)
    setValidationStatus('speech', { isValid: result.isValid, message, lastTestedAt: new Date() })
    addLog(`Speech validation: ${message}`, result.isValid ? 'success' : 'error')
    return result.isValid
  }

  const validateOpenAi = async () => {
    if (!openAiEndpoint || !openAiKey || !openAiDeployment) return false
    setOpenAiStatus('validating')
    // Basic validation - check fields are filled
    const isValid = !!(openAiEndpoint && openAiKey && openAiDeployment)
    setOpenAiStatus(isValid ? 'valid' : 'error')
    const message = isValid ? 'Configuration verified' : 'Please fill all fields'
    setOpenAiMessage(message)
    setValidationStatus('openai', { isValid, message, lastTestedAt: new Date() })
    addLog(`OpenAI validation: ${isValid ? 'OK' : 'Missing fields'}`, isValid ? 'success' : 'error')
    return isValid
  }

  const handleSaveAndContinue = async () => {
    // Save ACS configuration
    if (acsEndpoint && acsAccessKey) {
      setConfig({ 
        endpoint: acsEndpoint.trim(),
        accessKey: acsAccessKey.trim()
      })
    }
    
    // Save Speech configuration
    if (speechKey) {
      setSpeechConfig({
        key: speechKey.trim(),
        region: speechRegion
      })
    }
    
    // Save OpenAI configuration
    if (openAiEndpoint && openAiKey && openAiDeployment) {
      setOpenAIConfig({
        endpoint: openAiEndpoint.trim(),
        apiKey: openAiKey.trim(),
        deployment: openAiDeployment.trim()
      })
    }
  }

  // Expose save handler via ref
  if (onSaveRef) {
    onSaveRef.current = handleSaveAndContinue
  }

  const isAcsValid = acsEndpoint && acsAccessKey
  const isSpeechValid = speechKey && speechRegion
  const isOpenAiValid = openAiEndpoint && openAiKey && openAiDeployment
  
  // All services must be validated before continuing
  const allServicesValidated = acsStatus === 'valid' && speechStatus === 'valid' && openAiStatus === 'valid'
  
  // Notify parent when validation status changes
  useEffect(() => {
    if (onValidatedChange) {
      onValidatedChange(allServicesValidated)
    }
  }, [allServicesValidated, onValidatedChange])

  return (
    <div>
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center mx-auto mb-5 ring-4 ring-blue-500/5">
          <Cloud className="w-10 h-10 text-blue-500" />
        </div>
        <h2 className="text-3xl font-bold mb-3">Configure Azure Services</h2>
        <p className="text-muted-foreground text-base max-w-2xl mx-auto">
          All three Azure services are required for full functionality
        </p>
      </div>

      <div className="space-y-8 max-w-3xl mx-auto">
        {/* Connection String helper */}
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900 shadow-sm">
          <CardContent className="pt-6 pb-6">
            <div className="flex gap-4">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">
                  Quick Setup: Paste your ACS connection string
                </p>
                <Input
                  placeholder="endpoint=https://...;accesskey=..."
                  value={connectionString}
                  onChange={(e) => {
                    setConnectionString(e.target.value)
                    parseConnectionString(e.target.value)
                  }}
                  className="font-mono text-xs h-11"
                />
                <p className="text-xs text-muted-foreground mt-3">
                  Find this in Azure Portal → Communication Services → Keys
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ACS Configuration */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Azure Communication Services
              {isAcsValid && <Badge variant="secondary" className="ml-2"><Check className="w-3 h-3 mr-1" />Configured</Badge>}
            </CardTitle>
            <CardDescription>
              Required to join Teams meetings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="acs-endpoint" className="text-sm font-medium">ACS Endpoint</Label>
              <Input
                id="acs-endpoint"
                placeholder="https://your-acs.unitedstates.communication.azure.com/"
                value={acsEndpoint}
                onChange={(e) => setAcsEndpoint(e.target.value)}
                className="font-mono text-sm h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acs-key" className="text-sm font-medium">Access Key</Label>
              <Input
                id="acs-key"
                type="password"
                placeholder="Your ACS access key"
                value={acsAccessKey}
                onChange={(e) => setAcsAccessKey(e.target.value)}
                className="font-mono text-sm h-11"
              />
            </div>
            {acsStatus !== 'idle' && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                acsStatus === 'validating' ? 'bg-blue-50 dark:bg-blue-950/20' :
                acsStatus === 'valid' ? 'bg-green-50 dark:bg-green-950/20' : 
                'bg-red-50 dark:bg-red-950/20'
              }`}>
                {acsStatus === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                {acsStatus === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {acsStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                <p className={`text-sm ${
                  acsStatus === 'validating' ? 'text-blue-700 dark:text-blue-300' :
                  acsStatus === 'valid' ? 'text-green-700 dark:text-green-300' : 
                  'text-red-700 dark:text-red-300'
                }`}>
                  {acsStatus === 'validating' ? 'Validating...' : acsMessage}
                </p>
              </div>
            )}
            {isAcsValid && (
              <div className="flex items-center justify-between pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={validateAcs}
                  disabled={acsStatus === 'validating'}
                >
                  {acsStatus === 'validating' ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Validating...</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 mr-2" />Test Connection</>
                  )}
                </Button>
                <a 
                  href="https://docs.microsoft.com/azure/communication-services/quickstarts/create-communication-resource" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Setup Guide
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Speech Configuration */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary" />
              Azure Speech Services
              {speechStatus === 'valid' && <Badge variant="secondary"><Check className="w-3 h-3 mr-1" />Configured</Badge>}
            </CardTitle>
            <CardDescription>
              Required for voice responses from your AI agent
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="speech-key" className="text-sm font-medium">Speech Key</Label>
                <Input
                  id="speech-key"
                  type="password"
                  placeholder="Your Speech API key"
                  value={speechKey}
                  onChange={(e) => setSpeechKey(e.target.value)}
                  className="font-mono text-sm h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="speech-region" className="text-sm font-medium">Region</Label>
                <Input
                  id="speech-region"
                  type="text"
                  placeholder="e.g., eastus (copy from Azure portal)"
                  value={speechRegion}
                  onChange={(e) => setSpeechRegion(e.target.value.trim())}
                  className="font-mono text-sm h-11"
                />
              </div>
            </div>
            {speechStatus !== 'idle' && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                speechStatus === 'validating' ? 'bg-blue-50 dark:bg-blue-950/20' :
                speechStatus === 'valid' ? 'bg-green-50 dark:bg-green-950/20' : 
                'bg-red-50 dark:bg-red-950/20'
              }`}>
                {speechStatus === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                {speechStatus === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {speechStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                <p className={`text-sm ${
                  speechStatus === 'validating' ? 'text-blue-700 dark:text-blue-300' :
                  speechStatus === 'valid' ? 'text-green-700 dark:text-green-300' : 
                  'text-red-700 dark:text-red-300'
                }`}>
                  {speechStatus === 'validating' ? 'Validating...' : speechMessage}
                </p>
              </div>
            )}
            {isSpeechValid && (
              <div className="flex items-center justify-between pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={validateSpeech}
                  disabled={speechStatus === 'validating'}
                >
                  {speechStatus === 'validating' ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Validating...</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 mr-2" />Test Connection</>
                  )}
                </Button>
                <a 
                  href="https://docs.microsoft.com/azure/cognitive-services/speech-service/overview" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Setup Guide
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Azure OpenAI Configuration */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Azure OpenAI Service
              {isOpenAiValid && <Badge variant="secondary"><Check className="w-3 h-3 mr-1" />Configured</Badge>}
            </CardTitle>
            <CardDescription>
              Required for AI agent capabilities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="openai-endpoint" className="text-sm font-medium">Endpoint</Label>
              <Input
                id="openai-endpoint"
                placeholder="https://your-resource.openai.azure.com/"
                value={openAiEndpoint}
                onChange={(e) => setOpenAiEndpoint(e.target.value)}
                className="font-mono text-sm h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="openai-key" className="text-sm font-medium">API Key</Label>
                <Input
                  id="openai-key"
                  type="password"
                  placeholder="Your Azure OpenAI API key"
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  className="font-mono text-sm h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="openai-deployment" className="text-sm font-medium">Deployment Name</Label>
                <Input
                  id="openai-deployment"
                  placeholder="gpt-4o"
                  value={openAiDeployment}
                  onChange={(e) => setOpenAiDeployment(e.target.value)}
                  className="font-mono text-sm h-11"
                />
              </div>
            </div>
            {openAiStatus !== 'idle' && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                openAiStatus === 'validating' ? 'bg-blue-50 dark:bg-blue-950/20' :
                openAiStatus === 'valid' ? 'bg-green-50 dark:bg-green-950/20' : 
                'bg-red-50 dark:bg-red-950/20'
              }`}>
                {openAiStatus === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                {openAiStatus === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {openAiStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                <p className={`text-sm ${
                  openAiStatus === 'validating' ? 'text-blue-700 dark:text-blue-300' :
                  openAiStatus === 'valid' ? 'text-green-700 dark:text-green-300' : 
                  'text-red-700 dark:text-red-300'
                }`}>
                  {openAiStatus === 'validating' ? 'Validating...' : openAiMessage}
                </p>
              </div>
            )}
            {isOpenAiValid && (
              <div className="flex items-center justify-between pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={validateOpenAi}
                  disabled={openAiStatus === 'validating'}
                >
                  {openAiStatus === 'validating' ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Validating...</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 mr-2" />Test Connection</>
                  )}
                </Button>
                <a 
                  href="https://learn.microsoft.com/azure/ai-services/openai/quickstart" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Setup Guide
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Test All Connections */}
      <div className="flex justify-center pt-4">
        <Button 
          onClick={async () => {
            await Promise.all([
              validateAcs(),
              validateSpeech(),
              validateOpenAi()
            ]);
          }}
          disabled={acsStatus === 'validating' || speechStatus === 'validating' || openAiStatus === 'validating'}
          className="px-8"
          size="lg"
        >
          {(acsStatus === 'validating' || speechStatus === 'validating' || openAiStatus === 'validating') ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testing All Connections...</>
          ) : (
            <><CheckCircle2 className="w-4 h-4 mr-2" />Test All Connections</>
          )}
        </Button>
      </div>
    </div>
  )
}

// Agent type selection
type AgentType = 'copilot-studio' | 'copilot-studio-anon' | 'azure-foundry'

// Agent Setup step component
function AgentSetupStep({ 
  // onNext, 
  // onBack,
  // onSkip,
  onSaveRef
}: { 
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onSaveRef?: React.MutableRefObject<(() => Promise<void>) | undefined>
}) {
  const providers = useAgentProvidersStore((state) => state.providers)
  const addProvider = useAgentProvidersStore((state) => state.addProvider)
  
  const [agentType, setAgentType] = useState<AgentType>('copilot-studio')
  const [name, setName] = useState('')
  
  // Copilot Studio authenticated fields
  const [clientId, setClientId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [environmentId, setEnvironmentId] = useState('')
  const [botId, setBotId] = useState('')
  
  // Copilot Studio anonymous fields
  const [directLineSecret, setDirectLineSecret] = useState('')
  
  // Azure Foundry fields (service principal auth)
  const [projectEndpoint, setProjectEndpoint] = useState('')
  const [agentName, setAgentName] = useState('')
  const [tenantIdSp, setTenantIdSp] = useState('')
  const [clientIdSp, setClientIdSp] = useState('')
  const [clientSecretSp, setClientSecretSp] = useState('')
  const [region, setRegion] = useState('')

  const { accessToken } = useAgentStore()
  const { addLog } = useAppStore()
  const [agentValidationStatus, setAgentValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'error'>('idle')
  const [agentValidationMessage, setAgentValidationMessage] = useState<string>('')

  // Device code authentication state for Copilot Studio
  const [authStatus, setAuthStatus] = useState<'idle' | 'authenticating' | 'authenticated' | 'error'>('idle')
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string; message?: string } | null>(null)
  const [authAccessToken, setAuthAccessToken] = useState<string | null>(null)
  const agentProviderRef = useRef<CopilotStudioAgentProvider | null>(null)

  // Cleanup agent provider on unmount
  useEffect(() => {
    return () => {
      if (agentProviderRef.current) {
        agentProviderRef.current.dispose().catch(console.error)
      }
    }
  }, [])

  // Handle device code authentication for Copilot Studio
  const handleAuthenticate = async () => {
    if (!clientId || !tenantId || !environmentId || !botId) {
      setAgentValidationStatus('error')
      setAgentValidationMessage('Please fill in all required fields first')
      return
    }

    setAuthStatus('authenticating')
    setDeviceCode(null)
    
    // Clear any cached auth to force fresh authentication in onboarding
    // Clear both cache keys used by different auth services
    localStorage.removeItem('copilot-studio-auth-cache')
    localStorage.removeItem('copilot_auth')

    try {
      // Create a temporary provider for authentication
      const provider = new CopilotStudioAgentProvider()
      agentProviderRef.current = provider

      // Create a temporary config for authentication
      const tempConfig = {
        id: 'temp-auth',
        name: name.trim() || 'Temp Agent',
        type: 'copilot-studio' as const,
        authType: 'microsoft-device-code' as const,
        isDefault: false,
        createdAt: new Date(),
        preprocessing: { enabled: true, ttsOptimization: true },
        postprocessing: { enabled: true, formatLinks: true },
        settings: {
          clientId: clientId.trim(),
          tenantId: tenantId.trim(),
          environmentId: environmentId.trim(),
          botId: botId.trim(),
          botName: name.trim(),
        },
      }

      await provider.initialize(tempConfig as any)

      // Set up callback for device code
      provider.setCallbacks({
        onAuthStateChanged: (state) => {
          const device = (state as any).deviceCode
          if (device) {
            setDeviceCode({
              userCode: device.userCode,
              verificationUri: device.verificationUri,
              message: device.message,
            })
          }
        },
      })

      // Start authentication
      await provider.authenticate()

      // Check if authenticated
      if (provider.isAuthenticated()) {
        setAuthStatus('authenticated')
        // Get the access token from the provider (stored in authState.tokens.accessToken)
        const token = (provider as any).authState?.tokens?.accessToken
        if (token) {
          setAuthAccessToken(token)
        }
        // Clear any previous validation error when authentication succeeds
        setAgentValidationStatus('idle')
        setAgentValidationMessage('')
        addLog('Copilot Studio authentication successful', 'success')
      } else {
        setAuthStatus('error')
        setAgentValidationMessage('Authentication was not completed')
        addLog('Copilot Studio authentication was not completed', 'error')
      }
    } catch (error) {
      setAuthStatus('error')
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed'
      setAgentValidationMessage(errorMessage)
      addLog(`Copilot Studio authentication error: ${errorMessage}`, 'error')
    }
  }

  const validateAgent = async () => {
    setAgentValidationStatus('validating')
    setAgentValidationMessage('')

    if (agentType === 'copilot-studio') {
      // Check if authentication was completed
      if (authStatus !== 'authenticated') {
        setAgentValidationStatus('error')
        setAgentValidationMessage('Please authenticate first before testing the connection')
        return false
      }
      
      const cfg: CopilotStudioConfig = {
        clientId: clientId.trim(),
        tenantId: tenantId.trim(),
        environmentId: environmentId.trim(),
        botId: botId.trim(),
        botName: name.trim(),
      }
      // Use the token from authentication flow, falling back to store token
      const result = await validateCopilotStudioConfig(cfg, authAccessToken || accessToken || undefined)
      setAgentValidationStatus(result.isValid ? 'valid' : 'error')
      setAgentValidationMessage(result.message)
      addLog(`Copilot Studio validation: ${result.message}`, result.isValid ? 'success' : 'error')
      return result.isValid
    }

    if (agentType === 'copilot-studio-anon') {
      const result = await validateCopilotStudioAnonConfig(directLineSecret.trim())
      setAgentValidationStatus(result.isValid ? 'valid' : 'error')
      setAgentValidationMessage(result.message)
      addLog(`Copilot Anon validation: ${result.message}`, result.isValid ? 'success' : 'error')
      return result.isValid
    }

    if (agentType === 'azure-foundry') {
      const result = await validateAzureFoundryConfig(
        projectEndpoint.trim(),
        agentName.trim(),
        tenantIdSp.trim(),
        clientIdSp.trim(),
        clientSecretSp.trim(),
        region.trim()
      )
      setAgentValidationStatus(result.isValid ? 'valid' : 'error')
      setAgentValidationMessage(result.message)
      addLog(`Foundry validation: ${result.message}`, result.isValid ? 'success' : 'error')
      return result.isValid
    }

    return false
  }

  const handleCreateAgent = async () => {
    if (agentType === 'copilot-studio') {
      if (!name || !clientId || !tenantId || !environmentId || !botId) return

      const ok = await validateAgent()
      if (!ok) return

      const config: CopilotStudioProviderConfig = {
        id: crypto.randomUUID(),
        name: name.trim(),
        type: 'copilot-studio',
        authType: 'microsoft-device-code',
        isDefault: providers.length === 0,
        createdAt: new Date(),
        preprocessing: { enabled: true, ttsOptimization: true },
        postprocessing: { enabled: true, formatLinks: true },
        settings: {
          clientId: clientId.trim(),
          tenantId: tenantId.trim(),
          environmentId: environmentId.trim(),
          botId: botId.trim(),
          botName: name.trim(),
        },
      }
      addProvider(config)
    } else if (agentType === 'copilot-studio-anon') {
      if (!name || !directLineSecret) return

      const ok = await validateAgent()
      if (!ok) return

      const config: CopilotStudioAnonProviderConfig = {
        id: crypto.randomUUID(),
        name: name.trim(),
        type: 'copilot-studio-anon',
        authType: 'none',
        isDefault: providers.length === 0,
        createdAt: new Date(),
        preprocessing: { enabled: true, ttsOptimization: true },
        postprocessing: { enabled: true, formatLinks: true },
        settings: {
          directLineSecret: directLineSecret.trim(),
          botName: name.trim(),
        },
      }
      addProvider(config)
    } else if (agentType === 'azure-foundry') {
      if (!name || !projectEndpoint || !agentName || !tenantIdSp || !clientIdSp || !clientSecretSp || !region) return

      const ok = await validateAgent()
      if (!ok) return

      const config: AzureFoundryProviderConfig = {
        id: crypto.randomUUID(),
        name: name.trim(),
        type: 'azure-foundry',
        authType: 'service-principal',
        isDefault: providers.length === 0,
        createdAt: new Date(),
        preprocessing: { enabled: true, ttsOptimization: true },
        postprocessing: { enabled: true, formatLinks: true },
        settings: {
          projectEndpoint: projectEndpoint.trim(),
          agentName: agentName.trim(),
          tenantId: tenantIdSp.trim(),
          clientId: clientIdSp.trim(),
          clientSecret: clientSecretSp.trim(),
          region: region.trim(),
          displayName: name.trim(),
        },
      }
      addProvider(config)
    }
  }

  // Expose save handler via ref
  if (onSaveRef) {
    onSaveRef.current = handleCreateAgent
  }

  // Removed unused isFormValid variable
  // const isFormValid = (() => {
  //   if (!name.trim()) return false
  //   
  //   if (agentType === 'copilot-studio') {
  //     return clientId && tenantId && environmentId && botId
  //   } else if (agentType === 'copilot-studio-anon') {
  //     return !!directLineSecret
  //   } else if (agentType === 'azure-foundry') {
  //     return projectEndpoint && agentName && tenantIdSp && clientIdSp && clientSecretSp && region
  //   }
  //   return false
  // })()

  // If user already has agents, let them skip
  const hasExistingAgents = providers.length > 0

  return (
    <div>
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-3xl bg-violet-500/10 flex items-center justify-center mx-auto mb-5 ring-4 ring-violet-500/5">
          <Bot className="w-10 h-10 text-violet-500" />
        </div>
        <h2 className="text-3xl font-bold mb-3">Connect Your First Agent</h2>
        <p className="text-muted-foreground text-base max-w-2xl mx-auto">
          Add an AI agent to respond to questions in your meetings
        </p>
      </div>

      {hasExistingAgents && (
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900 mb-8 max-w-3xl mx-auto">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  You already have {providers.length} agent{providers.length > 1 ? 's' : ''} configured
                </p>
                <p className="text-xs text-muted-foreground">
                  You can skip this step or add another agent
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-8 max-w-3xl mx-auto">
        {/* Agent Type Selection */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Select Agent Type</Label>
          <div className="grid grid-cols-3 gap-4">
            <Card 
              className={`cursor-pointer transition-all shadow-sm hover:shadow-md ${
                agentType === 'copilot-studio' 
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                  : 'hover:border-primary/50'
              }`}
              onClick={() => setAgentType('copilot-studio')}
            >
              <CardContent className="pt-6 pb-5 text-center">
                <Shield className="w-8 h-8 mx-auto mb-3 text-primary" />
                <p className="text-sm font-semibold mb-1">Copilot Studio</p>
                <p className="text-xs text-muted-foreground">Authenticated</p>
              </CardContent>
            </Card>
            
            <Card 
              className={`cursor-pointer transition-all shadow-sm hover:shadow-md ${
                agentType === 'copilot-studio-anon' 
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                  : 'hover:border-primary/50'
              }`}
              onClick={() => setAgentType('copilot-studio-anon')}
            >
              <CardContent className="pt-6 pb-5 text-center">
                <Bot className="w-8 h-8 mx-auto mb-3 text-orange-500" />
                <p className="text-sm font-semibold mb-1">Copilot Studio</p>
                <p className="text-xs text-muted-foreground">Anonymous</p>
              </CardContent>
            </Card>
            
            <Card 
              className={`cursor-pointer transition-all shadow-sm hover:shadow-md ${
                agentType === 'azure-foundry' 
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                  : 'hover:border-primary/50'
              }`}
              onClick={() => setAgentType('azure-foundry')}
            >
              <CardContent className="pt-6 pb-5 text-center">
                <Zap className="w-8 h-8 mx-auto mb-3 text-blue-500" />
                <p className="text-sm font-semibold mb-1">Azure AI Foundry</p>
                <p className="text-xs text-muted-foreground">API Key</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Agent Name */}
        <div className="space-y-3">
          <Label htmlFor="agent-display-name" className="text-base font-semibold">Agent Display Name *</Label>
          <Input
            id="agent-display-name"
            placeholder="e.g., My Sales Assistant"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
          <p className="text-sm text-muted-foreground">
            This is how the agent will appear in your meetings
          </p>
        </div>

        {/* Type-specific fields */}
        {agentType === 'copilot-studio' && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Copilot Studio Configuration</CardTitle>
                  <CardDescription>
                    Find these values in Copilot Studio → Settings → Channels
                  </CardDescription>
                </div>
                <a 
                  href="https://learn.microsoft.com/microsoft-copilot-studio/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Setup Guide
                </a>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="client-id" className="text-sm font-medium">App Client ID *</Label>
                  <Input
                    id="client-id"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-id" className="text-sm font-medium">Tenant ID *</Label>
                  <Input
                    id="tenant-id"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="environment-id" className="text-sm font-medium">Environment ID *</Label>
                  <Input
                    id="environment-id"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={environmentId}
                    onChange={(e) => setEnvironmentId(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bot-id" className="text-sm font-medium">Bot ID / Schema Name *</Label>
                  <Input
                    id="bot-id"
                    placeholder="cr123_yourAgent"
                    value={botId}
                    onChange={(e) => setBotId(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
              </div>
              {/* Authentication Section */}
              <div className="border-t pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-sm font-medium">Authentication</Label>
                    <p className="text-xs text-muted-foreground">Sign in with your Microsoft account</p>
                  </div>
                  {authStatus === 'authenticated' && (
                    <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Authenticated
                    </Badge>
                  )}
                </div>
                
                {/* Device Code Display */}
                {authStatus === 'authenticating' && deviceCode && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                          Complete sign-in in your browser
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                          {deviceCode.message || 'Go to the verification URL and enter the code below'}
                        </p>
                        <div className="flex items-center gap-2 bg-white dark:bg-blue-900/50 rounded-md p-2 border border-blue-200 dark:border-blue-700">
                          <code className="text-lg font-bold text-blue-700 dark:text-blue-200 tracking-wider">
                            {deviceCode.userCode}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                            onClick={() => navigator.clipboard.writeText(deviceCode.userCode)}
                            title="Copy code"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <a
                          href={deviceCode.verificationUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-3 text-xs text-blue-600 hover:text-blue-700 underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open {deviceCode.verificationUri}
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Authenticating without device code yet */}
                {authStatus === 'authenticating' && !deviceCode && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 mb-4">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">Starting authentication...</p>
                  </div>
                )}

                {/* Authentication error */}
                {authStatus === 'error' && agentValidationMessage && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-sm text-red-700 dark:text-red-300">{agentValidationMessage}</p>
                  </div>
                )}

                {/* Authenticate Button */}
                {authStatus !== 'authenticated' && (
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleAuthenticate}
                    disabled={authStatus === 'authenticating' || !clientId || !tenantId || !environmentId || !botId}
                  >
                    {authStatus === 'authenticating' ? (
                      <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Waiting for sign-in...</>
                    ) : (
                      <><LogIn className="w-3 h-3 mr-2" />Sign In with Microsoft</>
                    )}
                  </Button>
                )}
              </div>

              {/* Validation Status */}
              {agentType === 'copilot-studio' && agentValidationStatus !== 'idle' && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  agentValidationStatus === 'validating' ? 'bg-blue-50 dark:bg-blue-950/20' :
                  agentValidationStatus === 'valid' ? 'bg-green-50 dark:bg-green-950/20' : 
                  'bg-red-50 dark:bg-red-950/20'
                }`}>
                  {agentValidationStatus === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                  {agentValidationStatus === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {agentValidationStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                  <p className={`text-sm ${
                    agentValidationStatus === 'validating' ? 'text-blue-700 dark:text-blue-300' :
                    agentValidationStatus === 'valid' ? 'text-green-700 dark:text-green-300' : 
                    'text-red-700 dark:text-red-300'
                  }`}>
                    {agentValidationStatus === 'validating' ? 'Validating...' : agentValidationMessage}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-end pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={validateAgent}
                  disabled={agentValidationStatus === 'validating' || authStatus !== 'authenticated' || !name || !clientId || !tenantId || !environmentId || !botId}
                >
                  {agentValidationStatus === 'validating' ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Validating...</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 mr-2" />Test Connection</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {agentType === 'copilot-studio-anon' && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Anonymous Agent Configuration</CardTitle>
                  <CardDescription>
                    Get your Direct Line secret from Copilot Studio → Settings → Security → Web channel security
                  </CardDescription>
                </div>
                <a 
                  href="https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Setup Guide
                </a>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="direct-line-secret" className="text-sm font-medium">Direct Line Secret *</Label>
                <Input
                  id="direct-line-secret"
                  type="password"
                  placeholder="Enter your Direct Line secret"
                  value={directLineSecret}
                  onChange={(e) => setDirectLineSecret(e.target.value)}
                  className="font-mono text-sm h-11"
                />
              </div>
              {agentType === 'copilot-studio-anon' && agentValidationStatus !== 'idle' && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  agentValidationStatus === 'validating' ? 'bg-blue-50 dark:bg-blue-950/20' :
                  agentValidationStatus === 'valid' ? 'bg-green-50 dark:bg-green-950/20' : 
                  'bg-red-50 dark:bg-red-950/20'
                }`}>
                  {agentValidationStatus === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                  {agentValidationStatus === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {agentValidationStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                  <p className={`text-sm ${
                    agentValidationStatus === 'validating' ? 'text-blue-700 dark:text-blue-300' :
                    agentValidationStatus === 'valid' ? 'text-green-700 dark:text-green-300' : 
                    'text-red-700 dark:text-red-300'
                  }`}>
                    {agentValidationStatus === 'validating' ? 'Validating...' : agentValidationMessage}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-end pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={validateAgent}
                  disabled={agentValidationStatus === 'validating' || !name || !directLineSecret}
                >
                  {agentValidationStatus === 'validating' ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Validating...</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 mr-2" />Test Connection</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {agentType === 'azure-foundry' && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Azure AI Foundry Configuration</CardTitle>
                  <CardDescription>
                    Find these values in Azure AI Foundry → Your Project → Settings
                  </CardDescription>
                </div>
                <a 
                  href="https://learn.microsoft.com/azure/ai-studio/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Setup Guide
                </a>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="project-endpoint" className="text-sm font-medium">Project Endpoint *</Label>
                <Input
                  id="project-endpoint"
                  placeholder="https://your-project.api.azureml.ms"
                  value={projectEndpoint}
                  onChange={(e) => setProjectEndpoint(e.target.value)}
                  className="font-mono text-sm h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="foundry-agent-name" className="text-sm font-medium">Agent ID *</Label>
                  <Input
                    id="foundry-agent-name"
                    placeholder="CAB-Foundry:2"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="foundry-region" className="text-sm font-medium">Region *</Label>
                  <Input
                    id="foundry-region"
                    placeholder="eastus2"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="foundry-tenant-id" className="text-sm font-medium">Tenant ID *</Label>
                <Input
                  id="foundry-tenant-id"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={tenantIdSp}
                  onChange={(e) => setTenantIdSp(e.target.value)}
                  className="font-mono text-sm h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="foundry-client-id" className="text-sm font-medium">Client ID *</Label>
                  <Input
                    id="foundry-client-id"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={clientIdSp}
                    onChange={(e) => setClientIdSp(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="foundry-client-secret" className="text-sm font-medium">Client Secret *</Label>
                  <Input
                    id="foundry-client-secret"
                    type="password"
                    placeholder="Your service principal secret"
                    value={clientSecretSp}
                    onChange={(e) => setClientSecretSp(e.target.value)}
                    className="font-mono text-sm h-11"
                  />
                </div>
              </div>
              {agentType === 'azure-foundry' && agentValidationStatus !== 'idle' && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  agentValidationStatus === 'validating' ? 'bg-blue-50 dark:bg-blue-950/20' :
                  agentValidationStatus === 'valid' ? 'bg-green-50 dark:bg-green-950/20' : 
                  'bg-red-50 dark:bg-red-950/20'
                }`}>
                  {agentValidationStatus === 'validating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                  {agentValidationStatus === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {agentValidationStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                  <p className={`text-sm ${
                    agentValidationStatus === 'validating' ? 'text-blue-700 dark:text-blue-300' :
                    agentValidationStatus === 'valid' ? 'text-green-700 dark:text-green-300' : 
                    'text-red-700 dark:text-red-300'
                  }`}>
                    {agentValidationStatus === 'validating' ? 'Validating...' : agentValidationMessage}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-end pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={validateAgent}
                  disabled={agentValidationStatus === 'validating' || !name || !projectEndpoint || !agentName || !tenantIdSp || !clientIdSp || !clientSecretSp || !region}
                >
                  {agentValidationStatus === 'validating' ? (
                    <><Loader2 className="w-3 h-3 mr-2 animate-spin" />Validating...</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3 mr-2" />Test Connection</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// Completion step component
function CompleteStep({ onFinish }: { onFinish: () => void }) {
  const providers = useAgentProvidersStore((state) => state.providers)
  const { config } = useConfigStore()
  
  const hasAcs = config.endpoint && config.accessKey
  const hasAgent = providers.length > 0
  const hasSpeech = config.speech.key

  return (
    <div className="text-center max-w-2xl mx-auto py-8">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/5 flex items-center justify-center mx-auto mb-6">
        <PartyPopper className="w-10 h-10 text-green-500" />
      </div>
      
      <h1 className="text-3xl font-bold mb-3">You're All Set!</h1>
      <p className="text-muted-foreground text-lg mb-8">
        Your Community Agent Bridge is ready to use.
      </p>

      {/* Configuration Summary */}
      <Card className="mb-8 text-left">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Configuration Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Azure Communication Services</span>
            </div>
            {hasAcs ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                <Check className="w-3 h-3 mr-1" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not configured
              </Badge>
            )}
          </div>
          
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">AI Agents</span>
            </div>
            {hasAgent ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                <Check className="w-3 h-3 mr-1" />
                {providers.length} configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not configured
              </Badge>
            )}
          </div>
          
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Speech Services</span>
            </div>
            {hasSpeech ? (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                <Check className="w-3 h-3 mr-1" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Optional
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <div className="space-y-4 mb-8 text-left">
        <h3 className="text-sm font-semibold">Next Steps</h3>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">1</div>
            <div>
              <p className="text-sm font-medium">Join a Teams Meeting</p>
              <p className="text-xs text-muted-foreground">Paste a Teams meeting link on the home page</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">2</div>
            <div>
              <p className="text-sm font-medium">Authenticate with your agent</p>
              <p className="text-xs text-muted-foreground">Sign in when prompted to connect to Copilot Studio</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">3</div>
            <div>
              <p className="text-sm font-medium">Start talking!</p>
              <p className="text-xs text-muted-foreground">Say "Hey [Agent Name], [your question]" in the meeting</p>
            </div>
          </div>
        </div>
      </div>

      <Button size="lg" onClick={onFinish} className="mx-auto">
        Start Using Community Agent Bridge
        <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  )
}

// Main Onboarding Wizard component
export function OnboardingWizard() {
  const { 
    currentStep, 
    setCurrentStep, 
    completeStep, 
    completeOnboarding,
    skipOnboarding 
  } = useOnboardingStore()
  const setCurrentPage = useNavigationStore((state) => state.setCurrentPage)

  const acsSaveRef = useRef<(() => Promise<void>) | undefined>()
  const agentSaveRef = useRef<(() => Promise<void>) | undefined>()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [acsValidated, setAcsValidated] = useState(false)

  // Scroll to top when step changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [currentStep])

  const steps = [
    { id: 'welcome' as OnboardingStep, label: 'Welcome' },
    { id: 'acs-setup' as OnboardingStep, label: 'Azure Setup' },
    { id: 'agent-setup' as OnboardingStep, label: 'Add Agent' },
    { id: 'complete' as OnboardingStep, label: 'Done' },
  ]

  const handleNext = async (fromStep: OnboardingStep) => {
    // Call the appropriate save handler
    if (fromStep === 'acs-setup' && acsSaveRef.current) {
      await acsSaveRef.current()
    } else if (fromStep === 'agent-setup' && agentSaveRef.current) {
      await agentSaveRef.current()
    }

    completeStep(fromStep)
    const stepIndex = steps.findIndex(s => s.id === fromStep)
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1].id)
    }
  }

  const handleBack = (fromStep: OnboardingStep) => {
    const stepIndex = steps.findIndex(s => s.id === fromStep)
    if (stepIndex > 0) {
      setCurrentStep(steps[stepIndex - 1].id)
    }
  }

  const handleSkip = () => {
    skipOnboarding()
    setCurrentPage('home')
  }

  const handleFinish = () => {
    completeOnboarding()
    setCurrentPage('home')
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="h-full flex flex-col">
        {/* Step Indicator - hide on welcome and complete */}
        {currentStep !== 'welcome' && currentStep !== 'complete' && (
          <div className="flex-shrink-0 px-8 pt-8">
            <StepIndicator steps={steps} currentStep={currentStep} />
          </div>
        )}

        {/* Step Content - Scrollable */}
        <div 
          ref={scrollContainerRef}
          className={`flex-1 overflow-y-auto px-8 pb-8 ${currentStep === 'welcome' ? 'flex items-center justify-center' : 'pt-8'}`}
        >
          <div className="max-w-5xl mx-auto w-full">
            {currentStep === 'welcome' && (
              <WelcomeStep 
                onNext={() => handleNext('welcome')} 
                onSkip={handleSkip} 
              />
            )}
            
            {currentStep === 'acs-setup' && (
              <AcsSetupStep 
                onNext={() => handleNext('acs-setup')}
                onBack={() => handleBack('acs-setup')}
                onSkip={handleSkip}
                onSaveRef={acsSaveRef}
                onValidatedChange={setAcsValidated}
              />
            )}
            
            {currentStep === 'agent-setup' && (
              <AgentSetupStep 
                onNext={() => handleNext('agent-setup')}
                onBack={() => handleBack('agent-setup')}
                onSkip={handleSkip}
                onSaveRef={agentSaveRef}
              />
            )}
            
            {currentStep === 'complete' && (
              <CompleteStep onFinish={handleFinish} />
            )}
          </div>
        </div>

        {/* Fixed Bottom Navigation */}
        {currentStep !== 'welcome' && currentStep !== 'complete' && (
          <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur-sm">
            <div className="max-w-5xl mx-auto px-8 py-6">
              {/* Validation warning for ACS setup */}
              {currentStep === 'acs-setup' && !acsValidated && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm font-medium">
                      Please test all Azure service connections before continuing
                    </p>
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="lg" onClick={() => handleBack(currentStep)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button variant="ghost" size="lg" onClick={handleSkip}>
                    Skip for now
                  </Button>
                  <Button 
                    size="lg" 
                    onClick={() => handleNext(currentStep)}
                    disabled={currentStep === 'acs-setup' && !acsValidated}
                    title={currentStep === 'acs-setup' && !acsValidated ? 'Please validate all Azure services before continuing' : ''}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
