// ============================================
// Credential Service
// Secure credential storage using system credential manager
// via Tauri commands (Windows Credential Manager, macOS Keychain, Linux Secret Service)
// ============================================

import { invoke } from '@tauri-apps/api/tauri'
import { logger } from '@/lib/logger'

/**
 * Credential key prefixes for organized storage
 */
export const CredentialKeys = {
  // ACS credentials
  ACS_ACCESS_KEY: 'acs.accessKey',
  
  // Azure Speech credentials
  SPEECH_KEY: 'speech.key',
  
  // Azure OpenAI credentials  
  OPENAI_API_KEY: 'openai.apiKey',
  
  // Agent provider credentials (uses dynamic keys)
  // Format: agent.<type>.<id>.<field>
  // Example: agent.copilot-studio.abc123.clientSecret
  agentCredential: (agentId: string, field: string) => `agent.${agentId}.${field}`,
} as const

/**
 * Store a credential in the system credential manager
 */
export async function storeCredential(key: string, value: string): Promise<void> {
  try {
    await invoke('store_credential', { key, value })
    logger.debug(`Credential stored: ${key}`, 'CredentialService')
  } catch (error) {
    logger.error(`Failed to store credential: ${key}`, 'CredentialService', error)
    throw error
  }
}

/**
 * Retrieve a credential from the system credential manager
 * @returns The credential value, or null if not found
 */
export async function getCredential(key: string): Promise<string | null> {
  try {
    const result = await invoke<string | null>('get_credential', { key })
    return result
  } catch (error) {
    logger.error(`Failed to retrieve credential: ${key}`, 'CredentialService', error)
    throw error
  }
}

/**
 * Delete a credential from the system credential manager
 * @returns true if the credential was deleted, false if it didn't exist
 */
export async function deleteCredential(key: string): Promise<boolean> {
  try {
    const result = await invoke<boolean>('delete_credential', { key })
    logger.debug(`Credential deleted: ${key} (existed: ${result})`, 'CredentialService')
    return result
  } catch (error) {
    logger.error(`Failed to delete credential: ${key}`, 'CredentialService', error)
    throw error
  }
}

/**
 * Store multiple credentials at once
 */
export async function storeCredentialsBatch(credentials: Record<string, string>): Promise<number> {
  try {
    const pairs: [string, string][] = Object.entries(credentials)
    const count = await invoke<number>('store_credentials_batch', { credentials: pairs })
    logger.debug(`Credentials batch stored: ${count} items`, 'CredentialService')
    return count
  } catch (error) {
    logger.error('Failed to store credentials batch', 'CredentialService', error)
    throw error
  }
}

/**
 * Retrieve multiple credentials at once
 * @returns Object with key -> value (only includes found credentials)
 */
export async function getCredentialsBatch(keys: string[]): Promise<Record<string, string>> {
  try {
    const result = await invoke<Record<string, string>>('get_credentials_batch', { keys })
    return result
  } catch (error) {
    logger.error(`Failed to retrieve credentials batch: ${keys.length} keys`, 'CredentialService', error)
    throw error
  }
}

/**
 * Delete multiple credentials at once
 * @returns Number of credentials actually deleted
 */
export async function deleteCredentialsBatch(keys: string[]): Promise<number> {
  try {
    const count = await invoke<number>('delete_credentials_batch', { keys })
    logger.debug(`Credentials batch deleted: ${count} items`, 'CredentialService')
    return count
  } catch (error) {
    logger.error('Failed to delete credentials batch', 'CredentialService', error)
    throw error
  }
}

/**
 * Store all service credentials (ACS, Speech, OpenAI)
 */
export async function storeServiceCredentials(credentials: {
  acsAccessKey?: string
  speechKey?: string
  openaiApiKey?: string
}): Promise<void> {
  const toStore: Record<string, string> = {}
  
  if (credentials.acsAccessKey) {
    toStore[CredentialKeys.ACS_ACCESS_KEY] = credentials.acsAccessKey
  }
  if (credentials.speechKey) {
    toStore[CredentialKeys.SPEECH_KEY] = credentials.speechKey
  }
  if (credentials.openaiApiKey) {
    toStore[CredentialKeys.OPENAI_API_KEY] = credentials.openaiApiKey
  }
  
  if (Object.keys(toStore).length > 0) {
    await storeCredentialsBatch(toStore)
  }
}

/**
 * Retrieve all service credentials (ACS, Speech, OpenAI)
 */
export async function getServiceCredentials(): Promise<{
  acsAccessKey: string | null
  speechKey: string | null
  openaiApiKey: string | null
}> {
  const keys = [
    CredentialKeys.ACS_ACCESS_KEY,
    CredentialKeys.SPEECH_KEY,
    CredentialKeys.OPENAI_API_KEY,
  ]
  
  const result = await getCredentialsBatch(keys)
  
  return {
    acsAccessKey: result[CredentialKeys.ACS_ACCESS_KEY] || null,
    speechKey: result[CredentialKeys.SPEECH_KEY] || null,
    openaiApiKey: result[CredentialKeys.OPENAI_API_KEY] || null,
  }
}

/**
 * Delete all service credentials
 */
export async function deleteServiceCredentials(): Promise<void> {
  await deleteCredentialsBatch([
    CredentialKeys.ACS_ACCESS_KEY,
    CredentialKeys.SPEECH_KEY,
    CredentialKeys.OPENAI_API_KEY,
  ])
}

/**
 * Agent credential fields that should be stored securely
 */
export const SECURE_AGENT_FIELDS = [
  'clientSecret',      // Azure AD client secret
  'apiKey',           // API keys
  'directLineSecret', // Copilot Studio Direct Line secret
] as const

/**
 * Store secure fields for an agent provider
 */
export async function storeAgentCredentials(
  agentId: string,
  credentials: Partial<Record<typeof SECURE_AGENT_FIELDS[number], string>>
): Promise<void> {
  const toStore: Record<string, string> = {}
  
  for (const field of SECURE_AGENT_FIELDS) {
    const value = credentials[field]
    if (value) {
      toStore[CredentialKeys.agentCredential(agentId, field)] = value
    }
  }
  
  if (Object.keys(toStore).length > 0) {
    await storeCredentialsBatch(toStore)
  }
}

/**
 * Retrieve secure fields for an agent provider
 */
export async function getAgentCredentials(agentId: string): Promise<
  Partial<Record<typeof SECURE_AGENT_FIELDS[number], string>>
> {
  const keys = SECURE_AGENT_FIELDS.map(field => 
    CredentialKeys.agentCredential(agentId, field)
  )
  
  const result = await getCredentialsBatch(keys)
  
  const credentials: Partial<Record<typeof SECURE_AGENT_FIELDS[number], string>> = {}
  for (const field of SECURE_AGENT_FIELDS) {
    const key = CredentialKeys.agentCredential(agentId, field)
    if (result[key]) {
      credentials[field] = result[key]
    }
  }
  
  return credentials
}

/**
 * Delete all secure fields for an agent provider
 */
export async function deleteAgentCredentials(agentId: string): Promise<void> {
  const keys = SECURE_AGENT_FIELDS.map(field => 
    CredentialKeys.agentCredential(agentId, field)
  )
  await deleteCredentialsBatch(keys)
}

/**
 * Check if the credential service is available (running in Tauri)
 */
export function isCredentialServiceAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}
