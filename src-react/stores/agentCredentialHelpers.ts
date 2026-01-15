// ============================================
// Agent Credential Helpers
// Helper functions to manage agent provider credentials securely
// ============================================

import type { AgentProviderConfig } from '@/types'
import {
  storeAgentCredentials,
  getAgentCredentials,
  deleteAgentCredentials,
  SECURE_AGENT_FIELDS,
  isCredentialServiceAvailable
} from '@/services/credentialService'
import { logger } from '@/lib/logger'

/**
 * Fields in agent settings that should be stored securely
 */
const SECURE_SETTINGS_FIELDS = ['clientSecret', 'apiKey', 'directLineSecret'] as const

/**
 * Extract secure fields from agent config settings
 */
export function extractSecureFields(
  config: AgentProviderConfig
): Partial<Record<typeof SECURE_AGENT_FIELDS[number], string>> {
  const secure: Partial<Record<typeof SECURE_AGENT_FIELDS[number], string>> = {}
  const settings = config.settings as Record<string, unknown>
  
  for (const field of SECURE_SETTINGS_FIELDS) {
    const value = settings[field]
    if (typeof value === 'string' && value.trim()) {
      secure[field] = value
    }
  }
  
  return secure
}

/**
 * Remove secure fields from agent config (for storage in localStorage)
 */
export function stripSecureFields<T extends AgentProviderConfig>(config: T): T {
  const strippedSettings = { ...config.settings } as Record<string, unknown>
  
  for (const field of SECURE_SETTINGS_FIELDS) {
    if (field in strippedSettings) {
      // Replace with placeholder to indicate field exists but is stored securely
      strippedSettings[field] = ''
    }
  }
  
  return {
    ...config,
    settings: strippedSettings
  }
}

/**
 * Merge secure fields back into agent config
 */
export function mergeSecureFields<T extends AgentProviderConfig>(
  config: T,
  credentials: Partial<Record<typeof SECURE_AGENT_FIELDS[number], string>>
): T {
  const mergedSettings = { ...config.settings } as Record<string, unknown>
  
  for (const [field, value] of Object.entries(credentials)) {
    if (value) {
      mergedSettings[field] = value
    }
  }
  
  return {
    ...config,
    settings: mergedSettings
  }
}

/**
 * Save agent credentials to secure storage
 */
export async function saveAgentCredentialsSecure(config: AgentProviderConfig): Promise<void> {
  if (!isCredentialServiceAvailable()) {
    logger.debug('Credential service not available, skipping secure storage', 'AgentCredentials')
    return
  }
  
  const credentials = extractSecureFields(config)
  if (Object.keys(credentials).length > 0) {
    await storeAgentCredentials(config.id, credentials)
    logger.debug(`Agent credentials stored securely: ${config.id}`, 'AgentCredentials')
  }
}

/**
 * Load agent credentials from secure storage
 */
export async function loadAgentCredentialsSecure(
  config: AgentProviderConfig
): Promise<AgentProviderConfig> {
  if (!isCredentialServiceAvailable()) {
    logger.debug('Credential service not available, using config as-is', 'AgentCredentials')
    return config
  }
  
  try {
    const credentials = await getAgentCredentials(config.id)
    if (Object.keys(credentials).length > 0) {
      logger.debug(`Agent credentials loaded from secure storage: ${config.id}`, 'AgentCredentials')
      return mergeSecureFields(config, credentials)
    }
  } catch (error) {
    logger.warn(`Failed to load agent credentials from secure storage: ${config.id}`, 'AgentCredentials', error)
  }
  
  return config
}

/**
 * Delete agent credentials from secure storage
 */
export async function deleteAgentCredentialsSecure(agentId: string): Promise<void> {
  if (!isCredentialServiceAvailable()) {
    return
  }
  
  try {
    await deleteAgentCredentials(agentId)
    logger.debug(`Agent credentials deleted from secure storage: ${agentId}`, 'AgentCredentials')
  } catch (error) {
    logger.warn(`Failed to delete agent credentials from secure storage: ${agentId}`, 'AgentCredentials', error)
  }
}

/**
 * Load credentials for multiple agents
 */
export async function loadAllAgentCredentials(
  configs: AgentProviderConfig[]
): Promise<AgentProviderConfig[]> {
  if (!isCredentialServiceAvailable()) {
    return configs
  }
  
  const results = await Promise.all(
    configs.map(config => loadAgentCredentialsSecure(config))
  )
  
  return results
}
