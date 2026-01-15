import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useConfigStore } from '@/stores/configStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings, Rocket, AlertCircle, CheckCircle } from 'lucide-react'

export function SetupStage() {
  const setStage = useAppStore((state) => state.setStage)
  const addLog = useAppStore((state) => state.addLog)
  
  // Get config from store (loaded from .env)
  const { config, setConfig } = useConfigStore()
  
  const [token, setToken] = useState(config.accessKey || '')
  const [agentName, setAgentName] = useState(config.agentName || '')
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Sync from config store when it changes (e.g., after hydration from localStorage/env)
  useEffect(() => {
    if (config.accessKey && !token) setToken(config.accessKey)
    if (config.agentName && !agentName) setAgentName(config.agentName)
  }, [config.accessKey, config.agentName])

  const handleInitialize = async () => {
    if (!token.trim()) {
      setError('Please enter an ACS token')
      return
    }

    setIsInitializing(true)
    setError(null)
    addLog('Initializing ACS client...', 'info')

    try {
      // Save token to config store
      setConfig({ accessKey: token, agentName })
      
      // TODO: Replace with actual ACS initialization
      await new Promise((resolve) => setTimeout(resolve, 1500))
      
      setSuccess(true)
      addLog('✓ ACS client initialized successfully', 'success')
      
      // Move to connect stage after brief delay
      setTimeout(() => {
        setStage('connect')
      }, 1000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize'
      setError(message)
      addLog(`✗ Initialization failed: ${message}`, 'error')
    } finally {
      setIsInitializing(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <Settings className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Initialize Connection</CardTitle>
          <CardDescription>
            Configure your Azure Communication Services credentials to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agentName">Agent Name</Label>
            <Input
              id="agentName"
              type="text"
              placeholder="Enter agent display name..."
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              disabled={isInitializing || success}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acsToken">ACS Access Token</Label>
            <Input
              id="acsToken"
              type="password"
              placeholder="Enter your ACS token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={isInitializing || success}
            />
          </div>

          <Button
            onClick={handleInitialize}
            disabled={isInitializing || success || !token.trim()}
            className="w-full"
            size="lg"
          >
            {isInitializing ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Initializing...
              </>
            ) : success ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Initialized!
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 mr-2" />
                Initialize Client
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-md bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-md bg-success/10 text-success">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Client initialized! Proceeding to connect...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
