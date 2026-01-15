import { useState, useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { usePreferencesStore, type ThemeMode } from '@/stores/preferencesStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Settings, 
  Save, 
  Key,
  Server,
  Volume2,
  Check,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  RotateCcw,
  Loader2,
  CheckCircle2,
  PlayCircle,
  XCircle
} from 'lucide-react'
import {
  validateAcsConfig,
  validateSpeechConfig,
  validateOpenAIConfig,
  type ValidationResult
} from '@/services/validationService'

interface SettingsFormData {
  acsEndpoint: string
  acsAccessKey: string
  speechKey: string
  speechRegion: string
  openaiEndpoint: string
  openaiApiKey: string
  openaiDeployment: string
}

export function SettingsPage() {
  const { config, setConfig, setSpeechConfig, setOpenAIConfig, resetConfig } = useConfigStore()
  const { preferences, setTheme } = usePreferencesStore()
  const { resetOnboarding, hasCompletedOnboarding, hasSkipped } = useOnboardingStore()

  const [formData, setFormData] = useState<SettingsFormData>({
    acsEndpoint: config.endpoint || '',
    acsAccessKey: config.accessKey || '',
    speechKey: config.speech.key || '',
    speechRegion: config.speech.region || 'eastus',
    openaiEndpoint: config.openai.endpoint || '',
    openaiApiKey: config.openai.apiKey || '',
    openaiDeployment: config.openai.deployment || '',
  })

  const [isSaved, setIsSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  
  // Validation states
  const [acsValidation, setAcsValidation] = useState<ValidationResult | null>(null)
  const [acsValidating, setAcsValidating] = useState(false)
  const [speechValidation, setSpeechValidation] = useState<ValidationResult | null>(null)
  const [speechValidating, setSpeechValidating] = useState(false)
  const [openaiValidation, setOpenaiValidation] = useState<ValidationResult | null>(null)
  const [openaiValidating, setOpenaiValidating] = useState(false)

  useEffect(() => {
    setFormData({
      acsEndpoint: config.endpoint || '',
      acsAccessKey: config.accessKey || '',
      speechKey: config.speech.key || '',
      speechRegion: config.speech.region || 'eastus',
      openaiEndpoint: config.openai.endpoint || '',
      openaiApiKey: config.openai.apiKey || '',
      openaiDeployment: config.openai.deployment || '',
    })
  }, [])

  const updateFormField = (field: keyof SettingsFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
    setIsSaved(false)
  }

  const handleSave = () => {
    setConfig({
      endpoint: formData.acsEndpoint.trim(),
      accessKey: formData.acsAccessKey.trim(),
    })
    
    setSpeechConfig({
      key: formData.speechKey.trim(),
      region: formData.speechRegion.trim(),
    })
    
    setOpenAIConfig({
      endpoint: formData.openaiEndpoint.trim(),
      apiKey: formData.openaiApiKey.trim(),
      deployment: formData.openaiDeployment.trim(),
    })

    setIsSaved(true)
    setHasChanges(false)
    setTimeout(() => setIsSaved(false), 3000)
  }

  const isAcsConfigured = formData.acsEndpoint && formData.acsAccessKey
  const isSpeechConfigured = formData.speechKey
  const isOpenAIConfigured = formData.openaiEndpoint && formData.openaiApiKey

  // Validation handlers
  const handleValidateAcs = async () => {
    setAcsValidating(true)
    const result = await validateAcsConfig(formData.acsEndpoint, formData.acsAccessKey)
    setAcsValidation(result)
    setAcsValidating(false)
  }

  const handleValidateSpeech = async () => {
    setSpeechValidating(true)
    const result = await validateSpeechConfig(formData.speechKey, formData.speechRegion)
    setSpeechValidation(result)
    setSpeechValidating(false)
  }

  const handleValidateOpenAI = async () => {
    setOpenaiValidating(true)
    const result = await validateOpenAIConfig(
      formData.openaiEndpoint, 
      formData.openaiApiKey, 
      formData.openaiDeployment
    )
    setOpenaiValidation(result)
    setOpenaiValidating(false)
  }

  // Clear validation when form changes
  useEffect(() => {
    setAcsValidation(null)
  }, [formData.acsEndpoint, formData.acsAccessKey])

  useEffect(() => {
    setSpeechValidation(null)
  }, [formData.speechKey, formData.speechRegion])

  useEffect(() => {
    setOpenaiValidation(null)
  }, [formData.openaiEndpoint, formData.openaiApiKey, formData.openaiDeployment])

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b bg-background/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">Configure theme and platform services</p>
          </div>
          <div className="flex items-center gap-2">
            {isSaved && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Check className="w-3 h-3" />
                Saved
              </Badge>
            )}
            {hasChanges && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <AlertCircle className="w-3 h-3" />
                Unsaved
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={!hasChanges} size="sm">
            <Save className="w-3 h-3 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-8 py-6 space-y-6">
          {/* Appearance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sun className="w-4 h-4" />
                Appearance
              </CardTitle>
              <CardDescription className="text-xs">
                Choose your preferred color theme
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <ThemeOption
                  icon={<Sun className="w-4 h-4" />}
                  label="Light"
                  value="light"
                  current={preferences.ui?.theme || 'light'}
                  onSelect={setTheme}
                />
                <ThemeOption
                  icon={<Moon className="w-4 h-4" />}
                  label="Dark"
                  value="dark"
                  current={preferences.ui?.theme || 'light'}
                  onSelect={setTheme}
                />
                <ThemeOption
                  icon={<Monitor className="w-4 h-4" />}
                  label="System"
                  value="system"
                  current={preferences.ui?.theme || 'light'}
                  onSelect={setTheme}
                />
              </div>
            </CardContent>
          </Card>

          {/* Azure Communication Services */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="w-4 h-4" />
                Azure Communication Services
                {isAcsConfigured && acsValidation?.isValid && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    <Check className="w-2.5 h-2.5 mr-0.5" />
                    Verified
                  </Badge>
                )}
                {isAcsConfigured && !acsValidation && (
                  <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                    Not Tested
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Required for joining Teams meetings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="acsEndpoint" className="text-xs">ACS Endpoint</Label>
                <Input
                  id="acsEndpoint"
                  placeholder="https://your-resource.communication.azure.com"
                  value={formData.acsEndpoint}
                  onChange={(e) => updateFormField('acsEndpoint', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acsAccessKey" className="text-xs">ACS Access Key</Label>
                <Input
                  id="acsAccessKey"
                  type="password"
                  placeholder="Your ACS access key"
                  value={formData.acsAccessKey}
                  onChange={(e) => updateFormField('acsAccessKey', e.target.value)}
                />
              </div>
              
              {/* Validation Section */}
              <div className="pt-2 space-y-2">
                <Button 
                  onClick={handleValidateAcs} 
                  disabled={!isAcsConfigured || acsValidating}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {acsValidating ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Testing Connection...
                    </>
                  ) : acsValidation?.isValid ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-2 text-green-600" />
                      Retest Connection
                    </>
                  ) : acsValidation && !acsValidation.isValid ? (
                    <>
                      <XCircle className="w-3 h-3 mr-2 text-red-500" />
                      Retry Test
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-3 h-3 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
                
                {acsValidation && (
                  <div className={`rounded-lg border p-3 text-sm ${
                    acsValidation.isValid 
                      ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200' 
                      : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      {acsValidation.isValid ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">{acsValidation.message}</p>
                        {acsValidation.details && (
                          <p className="text-xs opacity-90">{acsValidation.details}</p>
                        )}
                        <p className="text-[10px] opacity-70">
                          Tested at {acsValidation.testedAt.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Azure Speech Services */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Azure Speech Services
                {isSpeechConfigured && speechValidation?.isValid && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    <Check className="w-2.5 h-2.5 mr-0.5" />
                    Verified
                  </Badge>
                )}
                {isSpeechConfigured && !speechValidation && (
                  <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                    Not Tested
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Text-to-speech for AI responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="speechKey" className="text-xs">Speech Key</Label>
                  <Input
                    id="speechKey"
                    type="password"
                    placeholder="Your Speech service key"
                    value={formData.speechKey}
                    onChange={(e) => updateFormField('speechKey', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="speechRegion" className="text-xs">Region</Label>
                  <Input
                    id="speechRegion"
                    placeholder="e.g., eastus"
                    value={formData.speechRegion}
                    onChange={(e) => updateFormField('speechRegion', e.target.value)}
                  />
                </div>
              </div>
              
              {/* Validation Section */}
              <div className="space-y-2">
                <Button 
                  onClick={handleValidateSpeech} 
                  disabled={!isSpeechConfigured || speechValidating}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {speechValidating ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Testing Connection...
                    </>
                  ) : speechValidation?.isValid ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-2 text-green-600" />
                      Retest Connection
                    </>
                  ) : speechValidation && !speechValidation.isValid ? (
                    <>
                      <XCircle className="w-3 h-3 mr-2 text-red-500" />
                      Retry Test
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-3 h-3 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
                
                {speechValidation && (
                  <div className={`rounded-lg border p-3 text-sm ${
                    speechValidation.isValid 
                      ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200' 
                      : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      {speechValidation.isValid ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">{speechValidation.message}</p>
                        {speechValidation.details && (
                          <p className="text-xs opacity-90">{speechValidation.details}</p>
                        )}
                        <p className="text-[10px] opacity-70">
                          Tested at {speechValidation.testedAt.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Azure OpenAI */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Key className="w-4 h-4" />
                Azure OpenAI (GPT)
                {isOpenAIConfigured && openaiValidation?.isValid && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    <Check className="w-2.5 h-2.5 mr-0.5" />
                    Verified
                  </Badge>
                )}
                {isOpenAIConfigured && !openaiValidation && (
                  <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                    Not Tested
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                AI model for generating responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="openaiEndpoint" className="text-xs">OpenAI Endpoint</Label>
                <Input
                  id="openaiEndpoint"
                  placeholder="https://your-resource.openai.azure.com"
                  value={formData.openaiEndpoint}
                  onChange={(e) => updateFormField('openaiEndpoint', e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="openaiApiKey" className="text-xs">API Key</Label>
                  <Input
                    id="openaiApiKey"
                    type="password"
                    placeholder="Your OpenAI API key"
                    value={formData.openaiApiKey}
                    onChange={(e) => updateFormField('openaiApiKey', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openaiDeployment" className="text-xs">Deployment</Label>
                  <Input
                    id="openaiDeployment"
                    placeholder="e.g., gpt-4"
                    value={formData.openaiDeployment}
                    onChange={(e) => updateFormField('openaiDeployment', e.target.value)}
                  />
                </div>
              </div>
              
              {/* Validation Section */}
              <div className="space-y-2">
                <Button 
                  onClick={handleValidateOpenAI} 
                  disabled={!isOpenAIConfigured || openaiValidating}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  {openaiValidating ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Testing Connection...
                    </>
                  ) : openaiValidation?.isValid ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-2 text-green-600" />
                      Retest Connection
                    </>
                  ) : openaiValidation && !openaiValidation.isValid ? (
                    <>
                      <XCircle className="w-3 h-3 mr-2 text-red-500" />
                      Retry Test
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-3 h-3 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
                
                {openaiValidation && (
                  <div className={`rounded-lg border p-3 text-sm ${
                    openaiValidation.isValid 
                      ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200' 
                      : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      {openaiValidation.isValid ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">{openaiValidation.message}</p>
                        {openaiValidation.details && (
                          <p className="text-xs opacity-90">{openaiValidation.details}</p>
                        )}
                        <p className="text-[10px] opacity-70">
                          Tested at {openaiValidation.testedAt.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Setup Wizard */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Setup Wizard
                {hasCompletedOnboarding && !hasSkipped && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    <Check className="w-2.5 h-2.5 mr-0.5" />
                    Completed
                  </Badge>
                )}
                {hasSkipped && (
                  <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                    Skipped
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Guided setup for new users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Reset all settings and restart the setup wizard from scratch.
                  </p>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => {
                    resetConfig()
                    resetOnboarding()
                  }}
                >
                  <RotateCcw className="w-3 h-3 mr-1.5" />
                  Reset App
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}

// Theme selection button component
function ThemeOption({ 
  icon, 
  label, 
  value, 
  current, 
  onSelect 
}: { 
  icon: React.ReactNode
  label: string
  value: ThemeMode
  current: ThemeMode
  onSelect: (theme: ThemeMode) => void
}) {
  const isSelected = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
        isSelected 
          ? 'border-primary bg-primary/5' 
          : 'border-transparent bg-muted/50 hover:bg-muted'
      }`}
    >
      <div className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
        {icon}
      </div>
      <span className={`text-xs font-medium ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
        {label}
      </span>
      {isSelected && (
        <Check className="w-3 h-3 text-primary" />
      )}
    </button>
  )
}
