import { useState, useEffect } from 'react'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { useConfigStore } from '@/stores/configStore'
import { useNavigationStore } from '@/stores/navigationStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Bot, 
  Plus, 
  Pencil, 
  Trash2, 
  Star,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Shield,
  ShieldOff,
  Cloud,
  Settings2,
  PlayCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Copy,
  Info,
  Volume2,
  Square,
  BookOpen,
  Search,
  Filter,
  Zap
} from 'lucide-react'
import type { CopilotStudioProviderConfig, CopilotStudioAnonProviderConfig, AzureFoundryProviderConfig, AgentProviderConfig } from '@/types'
import { AZURE_VOICES as VOICE_OPTIONS } from '@/types'
import { CopilotStudioAgentProvider } from '@/providers/agent/CopilotStudioAgentProvider'
import { CopilotStudioAnonAgentProvider } from '@/providers/agent/CopilotStudioAnonAgentProvider'
import { AzureFoundryAgentProvider } from '@/providers/agent/AzureFoundryAgentProvider'
import type { AgentResponse } from '@/types/providers/agent'
import {
  validateCopilotStudioAnonConfig,
  validateAzureFoundryConfig
} from '@/services/validationService'

// Supported agent types for the form
type FormAgentType = 'copilot-studio' | 'copilot-studio-anon' | 'azure-foundry'

// Form data for authenticated Copilot Studio
interface AuthenticatedFormData {
  type: 'copilot-studio'
  name: string
  clientId: string
  tenantId: string
  environmentId: string
  botId: string
  botName: string
  voiceName: string
}

// Form data for anonymous Copilot Studio
interface AnonymousFormData {
  type: 'copilot-studio-anon'
  name: string
  directLineSecret: string
  botName: string
  voiceName: string
}

// Form data for Azure Foundry
interface FoundryFormData {
  type: 'azure-foundry'
  name: string
  projectEndpoint: string
  agentName: string
  tenantId: string
  clientId: string
  clientSecret: string
  region: string
  displayName: string
  voiceName: string
}

type AgentFormData = AuthenticatedFormData | AnonymousFormData | FoundryFormData

type TestStatus = 'idle' | 'running' | 'success' | 'error' | 'auth'

interface AgentTestResult {
  status: TestStatus
  message?: string
  detail?: string
  sample?: string
  testedAt?: string
}

interface AgentAuthStatus {
  isAuthenticated: boolean
  username?: string
}

const emptyAuthenticatedFormData: AuthenticatedFormData = {
  type: 'copilot-studio',
  name: '',
  clientId: '',
  tenantId: '',
  environmentId: '',
  botId: '',
  botName: '',
  voiceName: 'en-US-JennyNeural',
}

const emptyAnonymousFormData: AnonymousFormData = {
  type: 'copilot-studio-anon',
  name: '',
  directLineSecret: '',
  botName: '',
  voiceName: 'en-US-JennyNeural',
}

const emptyFoundryFormData: FoundryFormData = {
  type: 'azure-foundry',
  name: '',
  projectEndpoint: '',
  agentName: '',
  tenantId: '',
  clientId: '',
  clientSecret: '',
  region: '',
  displayName: '',
  voiceName: 'en-US-JennyNeural',
}

export function AgentsPage() {
  const providers = useAgentProvidersStore((state) => state.providers)
  const loadCredentials = useAgentProvidersStore((state) => state.loadCredentials)
  const addProvider = useAgentProvidersStore((state) => state.addProvider)
  const updateProvider = useAgentProvidersStore((state) => state.updateProvider)
  const removeProvider = useAgentProvidersStore((state) => state.removeProvider)
  const setDefaultProvider = useAgentProvidersStore((state) => state.setDefaultProvider)
  const setPage = useNavigationStore((state) => state.setPage)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [formData, setFormData] = useState<AgentFormData>(emptyAuthenticatedFormData)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, AgentTestResult>>({})
  const [authStatuses, setAuthStatuses] = useState<Record<string, AgentAuthStatus>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | FormAgentType>('all')

  // Ensure secure credentials are merged after hydration and bootstrap a default
  // Copilot Studio agent from saved app config if none exist (helps fresh installs).
  useEffect(() => {
    loadCredentials().catch(console.error)
  }, [loadCredentials])

  useEffect(() => {
    if (providers.length > 0) return

    // Create a default Copilot Studio provider from stored app config when available
    const { config } = useConfigStore.getState()
    const cs = config.copilotStudio
    const hasCopilotConfig = Boolean(
      (cs.clientId || cs.appClientId) && cs.tenantId && cs.environmentId && (cs.botId || cs.agentIdentifier)
    )

    if (!hasCopilotConfig) return

    const id = `copilot-${crypto.randomUUID()}`
    addProvider({
      id,
      name: cs.botName || 'Copilot Studio Agent',
      type: 'copilot-studio',
      authType: 'microsoft-device-code',
      isDefault: true,
      createdAt: new Date(),
      preprocessing: { enabled: true, ttsOptimization: true },
      postprocessing: { enabled: true, formatLinks: true },
      settings: {
        clientId: cs.clientId || cs.appClientId || '',
        tenantId: cs.tenantId,
        environmentId: cs.environmentId,
        botId: cs.botId || cs.agentIdentifier || '',
        botName: cs.botName || 'AI Agent'
      }
    })
    setDefaultProvider(id)
  }, [addProvider, providers.length, setDefaultProvider])

  // Filter providers based on search and type
  const filteredProviders = providers.filter(provider => {
    const matchesSearch = provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (provider.type === 'copilot-studio' && provider.settings.botId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (provider.type === 'copilot-studio-anon' && provider.settings.botName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (provider.type === 'azure-foundry' && provider.settings.agentName.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesType = typeFilter === 'all' || provider.type === typeFilter
    
    return matchesSearch && matchesType
  })

  const setTestResult = (id: string, partial: Partial<AgentTestResult>) => {
    setTestResults((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        status: prev[id]?.status || 'idle',
        ...partial,
      },
    }))
  }

  const setAuthStatus = (id: string, status: AgentAuthStatus) => {
    setAuthStatuses((prev) => ({
      ...prev,
      [id]: status,
    }))
  }

  // Check auth status for all Copilot Studio agents on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      for (const provider of providers) {
        if (provider.type === 'copilot-studio') {
          try {
            const configWithCategory = { ...provider, category: 'agent' } as AgentProviderConfig
            const agent = new CopilotStudioAgentProvider()
            await agent.initialize(configWithCategory as any)
            
            if ((agent as any).isAuthenticated()) {
              const authState = (agent as any).authState
              setAuthStatus(provider.id, {
                isAuthenticated: true,
                username: authState?.account?.username || authState?.account?.displayName || 'User'
              })
            }
            
            await agent.dispose()
          } catch (error) {
            console.error('Failed to check auth status for', provider.name, error)
          }
        }
      }
    }
    
    checkAuthStatus()
  }, [providers])

  const handleStartAdd = () => {
    setIsAddingNew(true)
    setEditingId(null)
    setExpandedId(null)
    setFormData(emptyAuthenticatedFormData)
  }

  const handleStartEdit = (provider: AgentProviderConfig) => {
    setEditingId(provider.id)
    setExpandedId(provider.id)
    setIsAddingNew(false)
    
    if (provider.type === 'copilot-studio') {
      setFormData({
        type: 'copilot-studio',
        name: provider.name,
        clientId: provider.settings.clientId,
        tenantId: provider.settings.tenantId,
        environmentId: provider.settings.environmentId,
        botId: provider.settings.botId,
        botName: provider.settings.botName || '',
        voiceName: provider.voiceName || 'en-US-JennyNeural',
      })
    } else if (provider.type === 'copilot-studio-anon') {
      setFormData({
        type: 'copilot-studio-anon',
        name: provider.name,
        directLineSecret: provider.settings.directLineSecret || '',
        botName: provider.settings.botName || '',
        voiceName: provider.voiceName || 'en-US-JennyNeural',
      })
    } else if (provider.type === 'azure-foundry') {
      setFormData({
        type: 'azure-foundry',
        name: provider.name,
        projectEndpoint: provider.settings.projectEndpoint,
        agentName: provider.settings.agentName,
        tenantId: provider.settings.tenantId || '',
        clientId: provider.settings.clientId || '',
        clientSecret: provider.settings.clientSecret || '',
        region: provider.settings.region || '',
        displayName: provider.settings.displayName || '',
        voiceName: provider.voiceName || 'en-US-JennyNeural',
      })
    }
  }

  const handleToggleExpand = (id: string) => {
    if (editingId === id) return // Don't collapse while editing
    setExpandedId(expandedId === id ? null : id)
    if (editingId) {
      setEditingId(null)
      setFormData(emptyAuthenticatedFormData)
    }
  }

  const handleCancel = () => {
    setIsAddingNew(false)
    setEditingId(null)
    setFormData(emptyAuthenticatedFormData)
  }

  const handleSave = () => {
    if (formData.type === 'copilot-studio') {
      // Authenticated agent validation
      if (!formData.name.trim() || !formData.clientId.trim() || 
          !formData.tenantId.trim() || !formData.environmentId.trim() || 
          !formData.botId.trim()) {
        return
      }

      const providerConfig: CopilotStudioProviderConfig = {
        id: editingId || crypto.randomUUID(),
        name: formData.name.trim(),
        type: 'copilot-studio',
        authType: 'microsoft-device-code',
        isDefault: editingId ? providers.find(p => p.id === editingId)?.isDefault : providers.length === 0,
        createdAt: editingId ? providers.find(p => p.id === editingId)?.createdAt || new Date() : new Date(),
        preprocessing: { enabled: true, ttsOptimization: true },
        postprocessing: { enabled: true, formatLinks: true },
        voiceName: formData.voiceName || 'en-US-JennyNeural',
        settings: {
          clientId: formData.clientId.trim(),
          tenantId: formData.tenantId.trim(),
          environmentId: formData.environmentId.trim(),
          botId: formData.botId.trim(),
          botName: formData.botName.trim() || formData.name.trim(),
        },
      }

      if (editingId) {
        updateProvider(editingId, providerConfig)
        setExpandedId(editingId)
      } else {
        addProvider(providerConfig)
      }
    } else if (formData.type === 'copilot-studio-anon') {
      // Anonymous agent validation
      if (!formData.name.trim() || !formData.directLineSecret.trim()) {
        return
      }

      const providerConfig: CopilotStudioAnonProviderConfig = {
        id: editingId || crypto.randomUUID(),
        name: formData.name.trim(),
        type: 'copilot-studio-anon',
        authType: 'none',
        isDefault: editingId ? providers.find(p => p.id === editingId)?.isDefault : providers.length === 0,
        createdAt: editingId ? providers.find(p => p.id === editingId)?.createdAt || new Date() : new Date(),
        preprocessing: { enabled: true, ttsOptimization: true },
        postprocessing: { enabled: true, formatLinks: true },
        voiceName: formData.voiceName || 'en-US-JennyNeural',
        settings: {
          directLineSecret: formData.directLineSecret.trim(),
          botName: formData.botName.trim() || formData.name.trim(),
        },
      }

      if (editingId) {
        updateProvider(editingId, providerConfig)
        setExpandedId(editingId)
      } else {
        addProvider(providerConfig)
      }
    } else if (formData.type === 'azure-foundry') {
      // Foundry agent validation
      if (!formData.name.trim() || !formData.projectEndpoint.trim() || 
          !formData.agentName.trim() || !formData.tenantId.trim() || !formData.clientId.trim() || 
          !formData.clientSecret.trim() || !formData.region.trim() || !formData.displayName.trim()) {
        return
      }

      const providerConfig: AzureFoundryProviderConfig = {
        id: editingId || crypto.randomUUID(),
        name: formData.name.trim(),
        type: 'azure-foundry',
        authType: 'service-principal',
        isDefault: editingId ? providers.find(p => p.id === editingId)?.isDefault : providers.length === 0,
        createdAt: editingId ? providers.find(p => p.id === editingId)?.createdAt || new Date() : new Date(),
        preprocessing: { enabled: true, ttsOptimization: true },
        postprocessing: { enabled: true, formatLinks: true },
        voiceName: formData.voiceName || 'en-US-JennyNeural',
        settings: {
          projectEndpoint: formData.projectEndpoint.trim(),
          agentName: formData.agentName.trim(),
          tenantId: formData.tenantId.trim(),
          clientId: formData.clientId.trim(),
          clientSecret: formData.clientSecret.trim(),
          region: formData.region.trim(),
          displayName: formData.displayName.trim() || formData.name.trim(),
        },
      }

      if (editingId) {
        updateProvider(editingId, providerConfig)
        setExpandedId(editingId)
      } else {
        addProvider(providerConfig)
      }
    }

    setIsAddingNew(false)
    setEditingId(null)
    setFormData(emptyAuthenticatedFormData)
  }

  const handleDelete = (id: string) => {
    removeProvider(id)
    setDeleteConfirmId(null)
    if (expandedId === id) setExpandedId(null)
    if (editingId === id) {
      setEditingId(null)
      setFormData(emptyAuthenticatedFormData)
    }
  }

  const handleSetDefault = (id: string) => {
    setDefaultProvider(id)
  }

  const updateFormField = <K extends keyof AuthenticatedFormData | keyof AnonymousFormData | keyof FoundryFormData>(
    field: K, 
    value: string
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleTypeChange = (type: FormAgentType) => {
    const currentName = formData.name
    if (type === 'copilot-studio') {
      setFormData({ ...emptyAuthenticatedFormData, name: currentName })
    } else if (type === 'copilot-studio-anon') {
      setFormData({ ...emptyAnonymousFormData, name: currentName })
    } else if (type === 'azure-foundry') {
      setFormData({ ...emptyFoundryFormData, name: currentName })
    }
  }

  const isFormValid = (() => {
    if (formData.type === 'copilot-studio') {
      return !!(formData.name.trim() && formData.clientId.trim() && 
        formData.tenantId.trim() && formData.environmentId.trim() && 
        formData.botId.trim())
    } else if (formData.type === 'copilot-studio-anon') {
      return !!(formData.name.trim() && formData.directLineSecret.trim())
    } else if (formData.type === 'azure-foundry') {
      return !!(formData.name.trim() && formData.projectEndpoint.trim() && 
        formData.agentName.trim() && formData.tenantId.trim() && formData.clientId.trim() && 
        formData.clientSecret.trim() && formData.region.trim() && formData.displayName.trim())
    }
    return false
  })()

  const runAgentSmokeTest = async (
    provider: AgentProviderConfig,
    onAuthPrompt?: (payload: { userCode: string; verificationUri?: string; message?: string }) => void
  ): Promise<{ sample?: string }> => {
    let agent:
      | CopilotStudioAgentProvider
      | CopilotStudioAnonAgentProvider
      | AzureFoundryAgentProvider

    if (provider.type === 'copilot-studio') {
      agent = new CopilotStudioAgentProvider()
      await agent.initialize(provider as any)
      agent.setCallbacks({
        onAuthStateChanged: (state) => {
          const device = (state as any).deviceCode
          if (device && onAuthPrompt) {
            onAuthPrompt({
              userCode: device.userCode,
              verificationUri: device.verificationUri,
              message: device.message,
            })
          }
        },
      })
      if (!agent.isAuthenticated()) {
        await agent.authenticate()
      }
    } else if (provider.type === 'copilot-studio-anon') {
      agent = new CopilotStudioAnonAgentProvider()
      await agent.initialize(provider as any)
    } else if (provider.type === 'azure-foundry') {
      agent = new AzureFoundryAgentProvider()
      await agent.initialize(provider as any)
    } else {
      throw new Error('Unsupported agent type for testing')
    }

    try {
      const conversation = await agent.startConversation()
      let sample = conversation.messages?.find((m) => m.role === 'assistant')?.content || conversation.messages?.[0]?.content

      // Send a lightweight hello to confirm round-trip, when supported
      if (typeof (agent as any).sendMessage === 'function') {
        const reply = (await (agent as any).sendMessage('Hello from CAB test')) as AgentResponse
        const replyMsg = reply.messages?.find((m) => m.role === 'assistant') || reply.messages?.[0]
        if (replyMsg?.content) {
          sample = replyMsg.content
        }
      }

      return { sample }
    } finally {
      await agent.dispose()
    }
  }

  const handleTestAgent = async (provider: AgentProviderConfig) => {
    setTestResult(provider.id, { status: 'running', message: 'Testing connection...' })
    
    try {
      // For Copilot Studio Anon, use quick validation first
      if (provider.type === 'copilot-studio-anon') {
        if (!provider.settings.directLineSecret) {
          setTestResult(provider.id, {
            status: 'error',
            message: 'Configuration incomplete',
            detail: 'Direct Line secret is missing. Please edit this agent to add your secret.',
            testedAt: new Date().toISOString(),
          })
          return
        }
        
        const validationResult = await validateCopilotStudioAnonConfig(
          provider.settings.directLineSecret
        )
        
        if (!validationResult.isValid) {
          setTestResult(provider.id, {
            status: 'error',
            message: validationResult.message,
            detail: validationResult.details,
            testedAt: validationResult.testedAt.toISOString(),
          })
          return
        }
        
        // If validation passed, run full smoke test to get sample response
        try {
          const result = await runAgentSmokeTest(provider)
          setTestResult(provider.id, {
            status: 'success',
            message: 'Connection verified',
            sample: result.sample,
            detail: validationResult.details,
            testedAt: new Date().toISOString(),
          })
        } catch (smokeError) {
          // Even if smoke test fails, validation passed so mark as success with note
          const smokeErrorMsg = smokeError instanceof Error ? smokeError.message : String(smokeError)
          console.error('❌ Copilot Studio Anonymous smoke test error:', smokeError)
          setTestResult(provider.id, {
            status: 'success',
            message: 'Connection verified',
            detail: validationResult.details + ` (Smoke test error: ${smokeErrorMsg})`,
            testedAt: validationResult.testedAt.toISOString(),
          })
        }
        return
      }
      
      // For Azure Foundry, use quick validation first
      if (provider.type === 'azure-foundry') {
        const validationResult = await validateAzureFoundryConfig(
          provider.settings.projectEndpoint,
          provider.settings.agentName,
          provider.settings.tenantId || '',
          provider.settings.clientId || '',
          provider.settings.clientSecret || '',
          provider.settings.region
        )
        
        if (!validationResult.isValid) {
          setTestResult(provider.id, {
            status: 'error',
            message: validationResult.message,
            detail: validationResult.details,
            testedAt: validationResult.testedAt.toISOString(),
          })
          return
        }
        
        // If validation passed, run full smoke test to get sample response
        try {
          const result = await runAgentSmokeTest(provider)
          setTestResult(provider.id, {
            status: 'success',
            message: 'Connection verified',
            sample: result.sample,
            detail: validationResult.details,
            testedAt: new Date().toISOString(),
          })
        } catch (smokeError) {
          // Even if smoke test fails, validation passed so mark as success with note
          const smokeErrorMsg = smokeError instanceof Error ? smokeError.message : String(smokeError)
          console.error('❌ Azure Foundry smoke test error:', smokeError)
          setTestResult(provider.id, {
            status: 'success',
            message: 'Connection verified',
            detail: validationResult.details + ` (Smoke test error: ${smokeErrorMsg})`,
            testedAt: validationResult.testedAt.toISOString(),
          })
        }
        return
      }
      
      // For Copilot Studio with auth, run full smoke test (requires auth flow)
      const result = await runAgentSmokeTest(provider, (payload) => {
        setTestResult(provider.id, {
          status: 'auth',
          message: `Enter code ${payload.userCode}`,
          detail: payload.message || payload.verificationUri || '',
          testedAt: new Date().toISOString(),
        })
      })
      
      setTestResult(provider.id, {
        status: 'success',
        message: 'Connection verified',
        sample: result.sample,
        testedAt: new Date().toISOString(),
      })
      
      // Update auth status for Copilot Studio authenticated agents
      if (provider.type === 'copilot-studio') {
        // Get username from the agent after successful test
        try {
          const configWithCategory = { ...provider, category: 'agent' } as AgentProviderConfig
          const agent = new CopilotStudioAgentProvider()
          await agent.initialize(configWithCategory as any)
          const authState = (agent as any).authState
          setAuthStatus(provider.id, {
            isAuthenticated: true,
            username: authState?.account?.username || authState?.account?.displayName || 'User'
          })
          await agent.dispose()
        } catch (error) {
          console.error('Failed to get auth info:', error)
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error'
      const needsAuth = detail.toLowerCase().includes('auth') || detail.toLowerCase().includes('token')
      setTestResult(provider.id, {
        status: needsAuth ? 'auth' : 'error',
        message: needsAuth ? 'Authentication required' : 'Test failed',
        detail,
        testedAt: new Date().toISOString(),
      })
    }
  }

  const handleSignOut = async (provider: AgentProviderConfig) => {
    if (provider.type !== 'copilot-studio') return
    
    try {
      const configWithCategory = { ...provider, category: 'agent' } as AgentProviderConfig
      const agent = new CopilotStudioAgentProvider()
      await agent.initialize(configWithCategory as any)
      
      // Call signOut method
      await (agent as any).signOut()
      await agent.dispose()
      
      // Clear auth status
      setAuthStatus(provider.id, {
        isAuthenticated: false
      })
      
      // Clear test results completely
      const { [provider.id]: removed, ...rest } = testResults
      setTestResults(rest)
      
      console.log('✅ Signed out from agent:', provider.name)
    } catch (error) {
      console.error('Failed to sign out:', error)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">AI Agents</h1>
            <p className="text-xs text-muted-foreground">Manage your Copilot Studio agents</p>
          </div>
        </div>
        <Button onClick={handleStartAdd} disabled={isAddingNew}>
          <Plus className="w-4 h-4 mr-2" />
          Add Agent
        </Button>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {/* Search and Filter Bar */}
          {providers.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search agents by name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              
              {/* Type Filter Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  Filter:
                </span>
                <Button
                  size="sm"
                  variant={typeFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setTypeFilter('all')}
                  className="h-7 text-xs"
                >
                  All ({providers.length})
                </Button>
                <Button
                  size="sm"
                  variant={typeFilter === 'copilot-studio' ? 'default' : 'outline'}
                  onClick={() => setTypeFilter('copilot-studio')}
                  className="h-7 text-xs gap-1"
                >
                  <Shield className="w-3 h-3" />
                  Copilot Studio ({providers.filter(p => p.type === 'copilot-studio').length})
                </Button>
                <Button
                  size="sm"
                  variant={typeFilter === 'copilot-studio-anon' ? 'default' : 'outline'}
                  onClick={() => setTypeFilter('copilot-studio-anon')}
                  className="h-7 text-xs gap-1"
                >
                  <ShieldOff className="w-3 h-3" />
                  Anonymous ({providers.filter(p => p.type === 'copilot-studio-anon').length})
                </Button>
                <Button
                  size="sm"
                  variant={typeFilter === 'azure-foundry' ? 'default' : 'outline'}
                  onClick={() => setTypeFilter('azure-foundry')}
                  className="h-7 text-xs gap-1"
                >
                  <Zap className="w-3 h-3" />
                  Azure Foundry ({providers.filter(p => p.type === 'azure-foundry').length})
                </Button>
              </div>
            </div>
          )}

          {/* Add New Agent Form */}
          {isAddingNew && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Plus className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Add New Agent</h3>
                      <p className="text-xs text-muted-foreground">Configure a Copilot Studio agent</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPage('help')
                      // Scroll to agent types section after navigation
                      setTimeout(() => {
                        const element = document.getElementById('agent-types-section')
                        element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }, 100)
                    }}
                    className="text-xs"
                  >
                    <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                    Learn More
                  </Button>
                </div>
                
                <AgentForm 
                  formData={formData}
                  updateFormField={updateFormField}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  isFormValid={isFormValid}
                  isNew
                  existingProviders={providers}
                  onTypeChange={handleTypeChange}
                  onCopyFrom={(provider) => {
                    if (provider.type === 'copilot-studio' && formData.type === 'copilot-studio') {
                      setFormData(prev => ({
                        ...prev as AuthenticatedFormData,
                        clientId: provider.settings.clientId,
                        tenantId: provider.settings.tenantId,
                        environmentId: provider.settings.environmentId,
                      }))
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Agents List */}
          {providers.length === 0 && !isAddingNew ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No agents configured</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                  Add a Copilot Studio agent to enable AI-powered responses in your meetings
                </p>
                <Button onClick={handleStartAdd}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Agent
                </Button>
              </CardContent>
            </Card>
          ) : filteredProviders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-1">No agents found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Try adjusting your search or filter criteria
                </p>
                <Button size="sm" variant="outline" onClick={() => {
                  setSearchQuery('')
                  setTypeFilter('all')
                }}>
                  Clear Filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredProviders.map((provider) => (
                <AgentCard
                  key={provider.id}
                  provider={provider}
                  isExpanded={expandedId === provider.id}
                  isEditing={editingId === provider.id}
                  isDeleting={deleteConfirmId === provider.id}
                  formData={editingId === provider.id ? formData : undefined}
                  onToggleExpand={() => handleToggleExpand(provider.id)}
                  onStartEdit={() => handleStartEdit(provider)}
                  onSetDefault={() => handleSetDefault(provider.id)}
                  onStartDelete={() => setDeleteConfirmId(provider.id)}
                  onConfirmDelete={() => handleDelete(provider.id)}
                  onCancelDelete={() => setDeleteConfirmId(null)}
                  onUpdateField={updateFormField}
                  onSave={handleSave}
                  onCancelEdit={handleCancel}
                  isFormValid={isFormValid}
                  testResult={testResults[provider.id]}
                  authStatus={authStatuses[provider.id]}
                  onTest={() => handleTestAgent(provider)}
                  onSignOut={() => handleSignOut(provider)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// Agent Card Component
interface AgentCardProps {
  provider: AgentProviderConfig
  isExpanded: boolean
  isEditing: boolean
  isDeleting: boolean
  formData?: AgentFormData
  onToggleExpand: () => void
  onStartEdit: () => void
  onSetDefault: () => void
  onStartDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onUpdateField: <K extends keyof AuthenticatedFormData | keyof AnonymousFormData | keyof FoundryFormData>(field: K, value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  isFormValid: boolean
  testResult?: AgentTestResult
  authStatus?: AgentAuthStatus
  onTest: () => void
  onSignOut: () => void
}

function AgentCard({
  provider,
  isExpanded,
  isEditing,
  isDeleting,
  formData,
  onToggleExpand,
  onStartEdit,
  onSetDefault,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
  onUpdateField,
  onSave,
  onCancelEdit,
  isFormValid,
  testResult,
  authStatus,
  onTest,
  onSignOut,
}: AgentCardProps) {
  const isAuthenticated = provider.type === 'copilot-studio'
  const isAnon = provider.type === 'copilot-studio-anon'
  const isFoundry = provider.type === 'azure-foundry'
  const settings = isAuthenticated ? provider.settings : null
  const anonSettings = isAnon ? provider.settings : null
  const foundrySettings = isFoundry ? provider.settings : null

  return (
    <Card className={`transition-all ${isExpanded ? 'ring-1 ring-primary/30' : ''}`}>
      <CardContent className="p-0">
        {/* Header Row - Always Visible */}
        <div 
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={onToggleExpand}
        >
          <button className="p-1 hover:bg-muted rounded transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isFoundry 
              ? 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'
              : isAnon
              ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400'
              : 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
          }`}>
            {isFoundry ? <Zap className="w-5 h-5" /> : isAnon ? <ShieldOff className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{provider.name}</h3>
              {provider.isDefault && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Default
                </Badge>
              )}
              {isAuthenticated && authStatus?.isAuthenticated && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {authStatus.username ? `Signed in as ${authStatus.username}` : 'Signed In'}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Agent Type Badge */}
              {isAuthenticated && (
                <Badge variant="outline" className="text-xs gap-1 bg-blue-500/5 text-blue-600 border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400">
                  <Shield className="w-3 h-3" />
                  Copilot Studio
                </Badge>
              )}
              {isAnon && (
                <Badge variant="outline" className="text-xs gap-1 bg-orange-500/5 text-orange-600 border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
                  <ShieldOff className="w-3 h-3" />
                  Anonymous
                </Badge>
              )}
              {isFoundry && (
                <Badge variant="outline" className="text-xs gap-1 bg-purple-500/5 text-purple-600 border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-400">
                  <Zap className="w-3 h-3" />
                  Azure Foundry
                </Badge>
              )}
              {/* Agent ID/Details */}
              <span className="text-xs text-muted-foreground font-mono">
                {settings && settings.botId.slice(0, 12)}
                {anonSettings && (anonSettings.directLineSecret 
                  ? `${anonSettings.directLineSecret.slice(0, 8)}...${anonSettings.directLineSecret.slice(-4)}`
                  : 'Not configured')}
                {foundrySettings && foundrySettings.agentName}
              </span>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {isDeleting ? (
              <>
                <Button size="sm" variant="destructive" onClick={onConfirmDelete}>
                  <Check className="w-3 h-3 mr-1" />
                  Delete
                </Button>
                <Button size="sm" variant="outline" onClick={onCancelDelete}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {isAuthenticated && authStatus?.isAuthenticated && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={onSignOut}
                    title="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                )}
                {!provider.isDefault && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={onSetDefault}
                    title="Set as default"
                  >
                    <Star className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={onStartEdit}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={onStartDelete}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t px-4 pb-4 pt-4 bg-muted/30">
            {isEditing && formData ? (
              <AgentForm
                formData={formData}
                updateFormField={onUpdateField}
                onSave={onSave}
                onCancel={onCancelEdit}
                isFormValid={isFormValid}
              />
            ) : (
              <div className="space-y-4">
                {/* Config Display */}
                {settings && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <ConfigField label="App Client ID" value={settings.clientId} />
                    <ConfigField label="Tenant ID" value={settings.tenantId} />
                    <ConfigField label="Environment ID" value={settings.environmentId} />
                    <ConfigField label="Bot ID" value={settings.botId} />
                    {settings.botName && (
                      <ConfigField label="Bot Display Name" value={settings.botName} />
                    )}
                    <ConfigField 
                      label="Voice" 
                      value={VOICE_OPTIONS.find(v => v.value === provider.voiceName)?.label || provider.voiceName || 'en-US-JennyNeural (Default)'} 
                    />
                  </div>
                )}
                {anonSettings && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ConfigField 
                      label="Direct Line Secret" 
                      value={anonSettings.directLineSecret 
                        ? '•'.repeat(16) + anonSettings.directLineSecret.slice(-4)
                        : 'Not configured - please edit to add secret'
                      } 
                    />
                    {anonSettings.botName && (
                      <ConfigField label="Bot Display Name" value={anonSettings.botName} />
                    )}
                    <ConfigField 
                      label="Voice" 
                      value={VOICE_OPTIONS.find(v => v.value === provider.voiceName)?.label || provider.voiceName || 'en-US-JennyNeural (Default)'} 
                    />
                  </div>
                )}
                {foundrySettings && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ConfigField label="Project Endpoint" value={foundrySettings.projectEndpoint} />
                    <ConfigField label="Agent Name" value={foundrySettings.agentName} />
                    <ConfigField label="Tenant ID" value={(foundrySettings.tenantId || '').slice(0, 8) + '...'} />
                    <ConfigField label="Client ID" value={(foundrySettings.clientId || '').slice(0, 8) + '...'} />
                    <ConfigField label="Client Secret" value={'•'.repeat(16) + (foundrySettings.clientSecret || '').slice(-4)} />
                    {foundrySettings.displayName && (
                      <ConfigField label="Display Name" value={foundrySettings.displayName} />
                    )}
                    <ConfigField 
                      label="Voice" 
                      value={VOICE_OPTIONS.find(v => v.value === provider.voiceName)?.label || provider.voiceName || 'en-US-JennyNeural (Default)'} 
                    />
                  </div>
                )}

                {/* Test Status */}
                {testResult && testResult.status !== 'idle' && (
                  <div className="rounded-lg border bg-background/60 p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {testResult.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      {testResult.status === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
                      {testResult.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                      {testResult.status === 'auth' && <Info className="w-4 h-4 text-blue-500" />}
                      <span>{testResult.message}</span>
                      {testResult.status === 'auth' && testResult.detail && (() => {
                        const codeMatch = testResult.detail.match(/code ([A-Z0-9]+)/);
                        return codeMatch ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 ml-1"
                            onClick={() => {
                              navigator.clipboard.writeText(codeMatch[1]);
                            }}
                            title="Copy device code"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        ) : null;
                      })()}
                      {testResult.testedAt && (
                        <span className="text-xs text-muted-foreground ml-auto">{new Date(testResult.testedAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                    {testResult.detail && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{testResult.detail}</p>
                    )}
                    {testResult.sample && (
                      <div className="text-xs rounded border bg-muted/50 p-2">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Sample reply</p>
                        <p className="leading-relaxed text-foreground">{testResult.sample}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Quick Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={onTest}>
                    {testResult?.status === 'running' ? (
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3 h-3 mr-2" />
                    )}
                    Test Agent
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onStartEdit}>
                    <Settings2 className="w-3 h-3 mr-2" />
                    Edit Configuration
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Config Field Display
function ConfigField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono bg-background/50 rounded px-2 py-1.5 truncate border">{value}</p>
    </div>
  )
}

// Agent Form Component
interface AgentFormProps {
  formData: AgentFormData
  updateFormField: <K extends keyof AuthenticatedFormData | keyof AnonymousFormData | keyof FoundryFormData>(field: K, value: string) => void
  onSave: () => void
  onCancel: () => void
  isFormValid: boolean
  isNew?: boolean
  existingProviders?: AgentProviderConfig[]
  onCopyFrom?: (provider: AgentProviderConfig) => void
  onTypeChange?: (type: FormAgentType) => void
}

function AgentForm({ formData, updateFormField, onSave, onCancel, isFormValid, isNew, existingProviders, onCopyFrom, onTypeChange }: AgentFormProps) {
  const copilotProviders = existingProviders?.filter(p => p.type === 'copilot-studio') || []
  const isAuthenticated = formData.type === 'copilot-studio'
  const isAnon = formData.type === 'copilot-studio-anon'
  const isFoundry = formData.type === 'azure-foundry'
  
  return (
    <div className="space-y-4">
      {/* Agent Type Selection - only show when adding new */}
      {isNew && onTypeChange && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-background border">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Agent Type:</span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={isAuthenticated ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => onTypeChange('copilot-studio')}
              >
                <Shield className="w-3 h-3 mr-1.5" />
                CPS Auth
              </Button>
              <Button
                variant={isAnon ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => onTypeChange('copilot-studio-anon')}
              >
                <ShieldOff className="w-3 h-3 mr-1.5" />
                CPS Anon
              </Button>
              <Button
                variant={isFoundry ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => onTypeChange('azure-foundry')}
              >
                <Cloud className="w-3 h-3 mr-1.5" />
                Foundry
              </Button>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {isAuthenticated 
              ? 'Copilot Studio with Microsoft login (device code flow)' 
              : isAnon 
                ? 'Copilot Studio without user auth (Direct Line token endpoint)'
                : 'Azure AI Foundry agent with OAuth2 service principal'}
          </span>
        </div>
      )}

      {/* Copy from existing - only show when adding new authenticated agent */}
      {isNew && isAuthenticated && copilotProviders.length > 0 && onCopyFrom && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-dashed">
          <span className="text-xs text-muted-foreground">Copy settings from:</span>
          <div className="flex flex-wrap gap-2">
            {copilotProviders.map((provider) => (
              <Button
                key={provider.id}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onCopyFrom(provider)}
              >
                <Bot className="w-3 h-3 mr-1.5" />
                {provider.name}
              </Button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto">Copies Client ID, Tenant ID, Environment ID</span>
        </div>
      )}

      {/* Common fields */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="agent-name" className="text-xs font-medium">Agent Name *</Label>
          <Input
            id="agent-name"
            placeholder="e.g., Sales Assistant"
            value={formData.name}
            onChange={(e) => updateFormField('name', e.target.value)}
          />
        </div>
        {!isFoundry && (
        <div className="space-y-1.5">
          <Label htmlFor="bot-name" className="text-xs font-medium">Bot Display Name</Label>
          <Input
            id="bot-name"
            placeholder="Name shown in chat"
            value={(formData as AuthenticatedFormData | AnonymousFormData).botName || ''}
            onChange={(e) => updateFormField('botName', e.target.value)}
          />
        </div>
        )}
      </div>

      {/* Voice Selection - Common for all types */}
      <VoiceSelector
        voiceName={formData.voiceName || 'en-US-JennyNeural'}
        onVoiceChange={(voice) => updateFormField('voiceName', voice)}
      />

      {/* Authenticated agent fields */}
      {isAuthenticated && formData.type === 'copilot-studio' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="bot-id" className="text-xs font-medium">Bot ID (Agent Identifier) *</Label>
            <Input
              id="bot-id"
              placeholder="cr123_agentName or your-agent-schema-name"
              value={formData.botId}
              onChange={(e) => updateFormField('botId', e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="client-id" className="text-xs font-medium">App Client ID *</Label>
              <Input
                id="client-id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={formData.clientId}
                onChange={(e) => updateFormField('clientId', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenant-id" className="text-xs font-medium">Tenant ID *</Label>
              <Input
                id="tenant-id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={formData.tenantId}
                onChange={(e) => updateFormField('tenantId', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="environment-id" className="text-xs font-medium">Environment ID *</Label>
              <Input
                id="environment-id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={formData.environmentId}
                onChange={(e) => updateFormField('environmentId', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </>
      )}

      {/* Anonymous agent fields */}
      {!isAuthenticated && formData.type === 'copilot-studio-anon' && (
        <div className="space-y-1.5">
          <Label htmlFor="direct-line-secret" className="text-xs font-medium">Direct Line Secret *</Label>
          <Input
            id="direct-line-secret"
            type="password"
            placeholder="Enter your Direct Line secret from Copilot Studio"
            value={formData.directLineSecret}
            onChange={(e) => updateFormField('directLineSecret', e.target.value)}
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Get this from Copilot Studio → Settings → Security → Web channel security → Secret
          </p>
        </div>
      )}

      {/* Azure Foundry agent fields */}
      {isFoundry && formData.type === 'azure-foundry' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="project-endpoint" className="text-xs font-medium">Project Endpoint *</Label>
            <Input
              id="project-endpoint"
              placeholder="https://your-project.services.ai.azure.com/api/projects/your-project-name"
              value={formData.projectEndpoint}
              onChange={(e) => updateFormField('projectEndpoint', e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Azure AI Foundry project endpoint URL
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name" className="text-xs font-medium">Agent ID *</Label>
              <Input
                id="agent-name"
                placeholder="CAB-Foundry:2"
                value={formData.agentName}
                onChange={(e) => updateFormField('agentName', e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Agent ID from Azure AI Foundry (e.g., CAB-Foundry:2)
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="region" className="text-xs font-medium">Region *</Label>
              <Input
                id="region"
                placeholder="eastus2"
                value={formData.region}
                onChange={(e) => updateFormField('region', e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Azure region (e.g., eastus2)
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-id" className="text-xs font-medium">Tenant ID *</Label>
            <Input
              id="tenant-id"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={formData.tenantId}
              onChange={(e) => updateFormField('tenantId', e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Azure AD Tenant ID (Directory ID from Azure Portal → Azure Active Directory)
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-id" className="text-xs font-medium">Client ID *</Label>
              <Input
                id="client-id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={formData.clientId}
                onChange={(e) => updateFormField('clientId', e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Application (client) ID from App Registration
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-secret" className="text-xs font-medium">Client Secret *</Label>
              <Input
                id="client-secret"
                type="password"
                placeholder="Enter client secret"
                value={formData.clientSecret}
                onChange={(e) => updateFormField('clientSecret', e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Client secret from App Registration → Certificates & secrets
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="display-name" className="text-xs font-medium">Display Name *</Label>
            <Input
              id="display-name"
              placeholder="Friendly name shown in the meeting"
              value={formData.displayName}
              onChange={(e) => updateFormField('displayName', e.target.value)}
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Name displayed to users in the meeting for mentions and responses
            </p>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button onClick={onSave} disabled={!isFormValid}>
          <Check className="w-4 h-4 mr-2" />
          {isNew ? 'Add Agent' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  )
}

// Voice Selector Component with Preview
interface VoiceSelectorProps {
  voiceName: string
  onVoiceChange: (voice: string) => void
}

// Singleton to track currently playing audio across all VoiceSelector instances
let currentAudioElement: HTMLAudioElement | null = null
let currentSynthesizer: import('microsoft-cognitiveservices-speech-sdk').SpeechSynthesizer | null = null
let currentSetIsPreviewing: ((value: boolean) => void) | null = null

function VoiceSelector({ voiceName, onVoiceChange }: VoiceSelectorProps) {
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const { config } = useConfigStore()

  // Stop any currently playing preview
  const stopPreview = () => {
    // Stop audio element
    if (currentAudioElement) {
      try {
        currentAudioElement.pause()
        currentAudioElement.currentTime = 0
        currentAudioElement.src = ''
      } catch (e) {
        console.warn('Error stopping audio:', e)
      }
      currentAudioElement = null
    }
    
    // Close synthesizer
    if (currentSynthesizer) {
      try {
        currentSynthesizer.close()
      } catch (e) {
        console.warn('Error closing synthesizer:', e)
      }
      currentSynthesizer = null
    }
    
    // Reset all isPreviewing states
    if (currentSetIsPreviewing) {
      currentSetIsPreviewing(false)
      currentSetIsPreviewing = null
    }
    setIsPreviewing(false)
  }

  const handlePreview = async () => {
    if (!config.speech?.key || !config.speech?.region) {
      setPreviewError('Azure Speech not configured. Configure in Settings first.')
      return
    }

    // Stop any currently playing preview (from this or other instances)
    stopPreview()

    setIsPreviewing(true)
    setPreviewError(null)
    currentSetIsPreviewing = setIsPreviewing

    try {
      const SpeechSDK = await import('microsoft-cognitiveservices-speech-sdk')
      
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
        config.speech.key,
        config.speech.region
      )
      speechConfig.speechSynthesisVoiceName = voiceName
      // Use WAV format for better browser compatibility with Audio element
      speechConfig.speechSynthesisOutputFormat = SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3

      // Don't use speaker output - we'll play manually to track playback
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null as unknown as import('microsoft-cognitiveservices-speech-sdk').AudioConfig)
      currentSynthesizer = synthesizer

      const text = "Hello! I'm your AI agent assistant for Teams meetings. This is how my voice will sound during the meeting."

      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted && result.audioData) {
            // Create blob from audio data and play it
            const audioBlob = new Blob([result.audioData], { type: 'audio/mp3' })
            const audioUrl = URL.createObjectURL(audioBlob)
            
            const audio = new Audio(audioUrl)
            currentAudioElement = audio
            
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl)
              if (currentAudioElement === audio) {
                currentAudioElement = null
                if (currentSetIsPreviewing === setIsPreviewing) {
                  setIsPreviewing(false)
                  currentSetIsPreviewing = null
                }
              }
            }
            
            audio.onerror = () => {
              URL.revokeObjectURL(audioUrl)
              // Don't show error - this fires when preview is stopped intentionally
              if (currentAudioElement === audio) {
                currentAudioElement = null
                if (currentSetIsPreviewing === setIsPreviewing) {
                  setIsPreviewing(false)
                  currentSetIsPreviewing = null
                }
              }
            }
            
            audio.play().catch(() => {
              // Don't show error - playback may be interrupted intentionally
              setIsPreviewing(false)
              currentSetIsPreviewing = null
            })
          } else if (result.reason === SpeechSDK.ResultReason.Canceled) {
            const cancellation = SpeechSDK.CancellationDetails.fromResult(result)
            // Only show error if it wasn't user-initiated
            if (cancellation.reason !== SpeechSDK.CancellationReason.Error || 
                !cancellation.errorDetails?.includes('disposed')) {
              console.log('Synthesis canceled:', cancellation.reason)
            }
            setIsPreviewing(false)
            currentSetIsPreviewing = null
          } else {
            setPreviewError('Preview failed. Please check your Azure Speech configuration.')
            setIsPreviewing(false)
            currentSetIsPreviewing = null
          }
          
          if (currentSynthesizer === synthesizer) {
            currentSynthesizer = null
          }
          synthesizer.close()
        },
        (error) => {
          setPreviewError(`Preview error: ${error}`)
          setIsPreviewing(false)
          if (currentSynthesizer === synthesizer) {
            currentSynthesizer = null
          }
          currentSetIsPreviewing = null
          synthesizer.close()
        }
      )
    } catch (err) {
      setPreviewError('Failed to load Azure Speech SDK.')
      setIsPreviewing(false)
      currentSynthesizer = null
      currentSetIsPreviewing = null
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="voice-select" className="text-xs font-medium">Voice for Text-to-Speech</Label>
      <div className="flex gap-2">
        <Select 
          value={voiceName} 
          valueText={VOICE_OPTIONS.find((v) => v.value === voiceName)?.label || voiceName}
          onValueChange={(newVoice) => {
            // Stop preview when changing voice
            stopPreview()
            onVoiceChange(newVoice)
          }}
        >
          <SelectTrigger id="voice-select" className="flex-1">
            <SelectValue placeholder="Select voice" />
          </SelectTrigger>
          <SelectContent>
            {VOICE_OPTIONS.map((voice) => (
              <SelectItem key={voice.value} value={voice.value} textValue={voice.label}>
                {voice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isPreviewing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={stopPreview}
            className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Square className="w-3 h-3 mr-1.5" />
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePreview}
            className="shrink-0"
          >
            <Volume2 className="w-3 h-3 mr-1.5" />
            Preview
          </Button>
        )}
      </div>
      {previewError && (
        <p className="text-[10px] text-amber-600">{previewError}</p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Preview uses Azure Speech Service with the actual voice.
      </p>
    </div>
  )
}
