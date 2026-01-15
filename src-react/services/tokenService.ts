// Token generation service for ACS
// Uses CommunicationIdentityClient to generate user tokens from access key

import { CommunicationIdentityClient } from '@azure/communication-identity'

interface TokenCache {
  token: string
  userId: string
  expiresAt: Date
}

let cachedToken: TokenCache | null = null

/**
 * Generate or retrieve cached ACS token
 * Now includes both 'voip' and 'chat' scopes for Teams meeting chat interop
 */
export async function getOrCreateToken(endpoint: string, accessKey: string): Promise<{ token: string; userId: string }> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    console.log('Using cached ACS token')
    return { token: cachedToken.token, userId: cachedToken.userId }
  }

  if (!endpoint || !accessKey) {
    throw new Error('ACS endpoint and access key are required')
  }

  try {
    // Create connection string from config
    const connectionString = `endpoint=${endpoint};accesskey=${accessKey}`
    
    // Create identity client
    const identityClient = new CommunicationIdentityClient(connectionString)
    
    // Create a new user identity
    const user = await identityClient.createUser()
    
    // Issue token for both calling and chat (for Teams meeting chat interop)
    const tokenResponse = await identityClient.getToken(user, ['voip', 'chat'])
    
    // Cache the results
    cachedToken = {
      token: tokenResponse.token,
      userId: user.communicationUserId,
      expiresAt: tokenResponse.expiresOn
    }
    
    console.log('Generated new ACS token for user:', cachedToken.userId)
    console.log('Token scopes: voip, chat (for Teams meeting chat interop)')
    
    return {
      token: cachedToken.token,
      userId: cachedToken.userId
    }
  } catch (error) {
    console.error('Error generating ACS token:', error)
    throw new Error(`Failed to generate token: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Clear cached token
 */
export function clearTokenCache(): void {
  cachedToken = null
  console.log('ACS token cache cleared')
}

/**
 * Check if we have a valid cached token
 */
export function hasValidToken(): boolean {
  return cachedToken !== null && cachedToken.expiresAt > new Date()
}

/**
 * Get cached user ID (if available)
 */
export function getCachedUserId(): string | null {
  return cachedToken?.userId ?? null
}

/**
 * Get cached token (if valid)
 */
export function getCachedToken(): string | null {
  if (cachedToken && cachedToken.expiresAt > new Date()) {
    return cachedToken.token
  }
  return null
}
