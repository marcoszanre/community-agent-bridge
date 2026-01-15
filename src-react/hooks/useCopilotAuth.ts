// useCopilotAuth - React hook for Copilot Studio authentication

import { useCallback, useEffect, useRef } from 'react'
import { useAgentStore } from '@/stores/agentStore'
import { useAppStore } from '@/stores/appStore'
import { useConfigStore } from '@/stores/configStore'
import { useAgentProvidersStore } from '@/stores/agentProvidersStore'
import { initCopilotAuth, CopilotAuthService } from '@/services/copilotAuthService'
import type { CopilotStudioProviderConfig } from '@/types'

export function useCopilotAuth() {
  const authServiceRef = useRef<CopilotAuthService | null>(null)
  const initChecked = useRef(false)
  
  const {
    setAuthState,
    setDeviceCode,
    setAccessToken,
    authState,
    deviceCode
  } = useAgentStore()
  
  const { addLog } = useAppStore()
  const { config } = useConfigStore()
  
  // Get the default Copilot Studio provider from agentProvidersStore
  const getDefaultProvider = useAgentProvidersStore((state) => state.getDefaultProvider)
  const providers = useAgentProvidersStore((state) => state.providers)
  
  // Get Copilot Studio config - prefer provider store, fallback to config store
  const getCopilotConfig = useCallback(() => {
    // First, try to get from the default provider
    const defaultProvider = getDefaultProvider()
    if (defaultProvider?.type === 'copilot-studio') {
      const settings = (defaultProvider as CopilotStudioProviderConfig).settings
      return {
        clientId: settings.clientId,
        tenantId: settings.tenantId,
        environmentId: settings.environmentId,
        botId: settings.botId
      }
    }
    
    // Try any copilot-studio provider
    const copilotProvider = providers.find(p => p.type === 'copilot-studio') as CopilotStudioProviderConfig | undefined
    if (copilotProvider) {
      return {
        clientId: copilotProvider.settings.clientId,
        tenantId: copilotProvider.settings.tenantId,
        environmentId: copilotProvider.settings.environmentId,
        botId: copilotProvider.settings.botId
      }
    }
    
    // Fallback to configStore (for backward compatibility)
    if (config.copilotStudio?.clientId && config.copilotStudio?.tenantId) {
      return {
        clientId: config.copilotStudio.clientId,
        tenantId: config.copilotStudio.tenantId,
        environmentId: config.copilotStudio.environmentId,
        botId: config.copilotStudio.botId
      }
    }
    
    return null
  }, [getDefaultProvider, providers, config.copilotStudio])

  // Check for cached authentication on mount
  useEffect(() => {
    if (initChecked.current) return
    initChecked.current = true

    const checkCachedAuth = async () => {
      const copilotConfig = getCopilotConfig()
      if (!copilotConfig?.tenantId || !copilotConfig?.clientId) {
        return
      }

      // Create auth service (also registers as singleton for CopilotService)
      const authService = initCopilotAuth({
        clientId: copilotConfig.clientId,
        tenantId: copilotConfig.tenantId,
        environmentId: copilotConfig.environmentId,
        botId: copilotConfig.botId
      })

      authServiceRef.current = authService

      // Check if we have valid cached tokens
      const hasValidToken = await authService.initialize()
      
      if (hasValidToken) {
        try {
          const token = await authService.getToken()
          const expiresAt = new Date(Date.now() + 3600 * 1000)
          setAccessToken(token, expiresAt)
          setAuthState('authenticated')
          addLog('Restored authentication from cache', 'success')
        } catch {
          setAuthState('idle')
        }
      }
    }

    checkCachedAuth()
  }, [getCopilotConfig, setAuthState, setAccessToken, addLog])

  // Start Device Code Flow authentication
  const startAuth = useCallback(async () => {
    const copilotConfig = getCopilotConfig()
    if (!copilotConfig?.tenantId || !copilotConfig?.clientId) {
      addLog('Missing Copilot Studio credentials', 'error')
      return false
    }

    try {
      addLog('Starting Copilot authentication...', 'info')
      setAuthState('authenticating')

      // Create auth service with config (also registers as singleton)
      authServiceRef.current = initCopilotAuth({
        clientId: copilotConfig.clientId,
        tenantId: copilotConfig.tenantId,
        environmentId: copilotConfig.environmentId,
        botId: copilotConfig.botId
      })

      // Set up callbacks
      authServiceRef.current.onDeviceCodeReceived = (code) => {
        addLog(`Go to: ${code.verificationUri}`, 'info')
        addLog(`Enter code: ${code.userCode}`, 'info')
        setDeviceCode(code)
      }

      authServiceRef.current.onAuthStatusChanged = (authenticated) => {
        if (authenticated) {
          setAuthState('authenticated')
          addLog('Authentication successful', 'success')
        }
      }

      // Start the sign-in flow
      const result = await authServiceRef.current.signIn()
      
      if (result.success) {
        // Get the token and set it
        const token = await authServiceRef.current.getToken()
        const expiresAt = new Date(Date.now() + 3600 * 1000) // 1 hour default
        setAccessToken(token, expiresAt)
        setAuthState('authenticated')
        return true
      }

      return false
    } catch (error) {
      addLog(`Auth failed: ${error}`, 'error')
      setAuthState('error')
      return false
    }
  }, [getCopilotConfig, addLog, setAuthState, setDeviceCode, setAccessToken])

  // Cancel authentication
  const cancelAuth = useCallback(() => {
    if (authServiceRef.current) {
      authServiceRef.current.cancelSignIn()
    }
    setAuthState('idle')
    setDeviceCode(null)
    addLog('Authentication cancelled', 'info')
  }, [setAuthState, setDeviceCode, addLog])

  // Open verification URL in browser (Tauri)
  const openVerificationUrl = useCallback(async () => {
    if (!deviceCode?.verificationUri) return

    try {
      // Use Tauri shell API to open in system browser
      const { open } = await import('@tauri-apps/api/shell')
      await open(deviceCode.verificationUri)
      addLog('Opened browser for authentication', 'info')
    } catch (error) {
      // Fallback to window.open for development
      window.open(deviceCode.verificationUri, '_blank')
      addLog('Opened auth URL in new tab', 'info')
    }
  }, [deviceCode, addLog])

  // Copy user code to clipboard
  const copyUserCode = useCallback(async () => {
    if (!deviceCode?.userCode) return

    try {
      await navigator.clipboard.writeText(deviceCode.userCode)
      addLog('Code copied to clipboard', 'info')
    } catch (error) {
      addLog('Failed to copy code', 'error')
    }
  }, [deviceCode, addLog])

  // Get current token
  const getToken = useCallback(async () => {
    if (!authServiceRef.current) return null
    try {
      return await authServiceRef.current.getToken()
    } catch {
      return null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (authServiceRef.current) {
        authServiceRef.current.cancelSignIn()
      }
    }
  }, [])

  return {
    startAuth,
    cancelAuth,
    openVerificationUrl,
    copyUserCode,
    getToken,
    authState,
    deviceCode,
    isAuthenticated: authState === 'authenticated',
    isAuthenticating: authState === 'authenticating'
  }
}
