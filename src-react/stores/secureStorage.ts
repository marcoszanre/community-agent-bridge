// ============================================
// Secure Storage Adapter for Zustand
// Custom storage that uses system credential manager for secrets
// and localStorage for non-sensitive data
// ============================================

import type { StateStorage } from 'zustand/middleware'
import { 
  getCredentialsBatch, 
  storeCredentialsBatch, 
  deleteCredentialsBatch,
  isCredentialServiceAvailable 
} from '@/services/credentialService'
import { logger } from '@/lib/logger'

/**
 * Configuration for secure storage
 */
export interface SecureStorageConfig {
  /** Storage name (used as prefix for credential keys) */
  name: string
  /** Fields that should be stored in credential manager (dot notation paths) */
  secureFields: readonly string[]
}

/**
 * Extract a value from an object using dot notation path
 */
function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current = obj
  
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  
  return current
}

/**
 * Set a value in an object using dot notation path
 */
function setValueByPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.')
  let current = obj as Record<string, unknown>
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (current[part] == null || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  
  current[parts[parts.length - 1]] = value
}

/**
 * Delete a value from an object using dot notation path (set to empty string)
 */
function clearValueByPath(obj: unknown, path: string): void {
  setValueByPath(obj, path, '')
}

/**
 * Create a credential key from storage name and field path
 */
function makeCredentialKey(storageName: string, fieldPath: string): string {
  return `${storageName}.${fieldPath}`
}

/**
 * Create a secure storage adapter for Zustand that stores sensitive fields
 * in the system credential manager and other data in localStorage
 */
export function createSecureStorage(config: SecureStorageConfig): StateStorage {
  const { name, secureFields } = config
  
  return {
    getItem: async (storageKey: string): Promise<string | null> => {
      try {
        // Get base data from localStorage
        const localData = localStorage.getItem(storageKey)
        
        if (!localData) {
          return null
        }
        
        // Parse the state
        const state = JSON.parse(localData)
        
        // If credential service is available, fetch secure fields
        if (isCredentialServiceAvailable() && secureFields.length > 0) {
          try {
            const credentialKeys = secureFields.map(field => 
              makeCredentialKey(name, field)
            )
            
            const credentials = await getCredentialsBatch(credentialKeys)
            
            // Merge secure values into state
            for (const field of secureFields) {
              const key = makeCredentialKey(name, field)
              const value = credentials[key]
              if (value) {
                setValueByPath(state.state, field, value)
              }
            }
          } catch (error) {
            logger.warn('Failed to load credentials from secure storage', 'SecureStorage', error)
            // Continue with localStorage data
          }
        }
        
        return JSON.stringify(state)
      } catch (error) {
        logger.error('Failed to get item from secure storage', 'SecureStorage', error)
        return null
      }
    },
    
    setItem: async (storageKey: string, value: string): Promise<void> => {
      try {
        const state = JSON.parse(value)
        
        // If credential service is available, extract and store secure fields
        if (isCredentialServiceAvailable() && secureFields.length > 0) {
          const credentials: Record<string, string> = {}
          
          for (const field of secureFields) {
            const fieldValue = getValueByPath(state.state, field)
            if (typeof fieldValue === 'string' && fieldValue.trim()) {
              credentials[makeCredentialKey(name, field)] = fieldValue
              // Clear the value in the state (don't store in localStorage)
              clearValueByPath(state.state, field)
            }
          }
          
          // Store credentials in system credential manager
          if (Object.keys(credentials).length > 0) {
            try {
              await storeCredentialsBatch(credentials)
            } catch (error) {
              logger.warn('Failed to store credentials in secure storage', 'SecureStorage', error)
              // Restore values for localStorage fallback
              for (const field of secureFields) {
                const key = makeCredentialKey(name, field)
                if (credentials[key]) {
                  setValueByPath(state.state, field, credentials[key])
                }
              }
            }
          }
        }
        
        // Store non-sensitive data in localStorage
        localStorage.setItem(storageKey, JSON.stringify(state))
      } catch (error) {
        logger.error('Failed to set item in secure storage', 'SecureStorage', error)
      }
    },
    
    removeItem: async (storageKey: string): Promise<void> => {
      try {
        // Remove from localStorage
        localStorage.removeItem(storageKey)
        
        // Remove credentials from secure storage
        if (isCredentialServiceAvailable() && secureFields.length > 0) {
          const credentialKeys = secureFields.map(field => 
            makeCredentialKey(name, field)
          )
          
          try {
            await deleteCredentialsBatch(credentialKeys)
          } catch (error) {
            logger.warn('Failed to delete credentials from secure storage', 'SecureStorage', error)
          }
        }
      } catch (error) {
        logger.error('Failed to remove item from secure storage', 'SecureStorage', error)
      }
    }
  }
}

/**
 * Predefined secure storage configurations
 */
export const SecureStorageConfigs = {
  /** Config store - ACS, Speech, and OpenAI credentials */
  config: {
    name: 'config',
    secureFields: [
      'config.accessKey',      // ACS access key
      'config.speech.key',     // Azure Speech key
      'config.openai.apiKey',  // Azure OpenAI API key
    ]
  },
  
  /** Agent providers store - agent-specific secrets */
  agentProviders: {
    name: 'agent-providers',
    // Note: Agent credentials are handled dynamically per-agent
    // This config is for the store structure itself
    secureFields: [] as string[]
  }
} as const
