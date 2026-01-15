// ============================================
// Stores Index
// ============================================

// New Provider Store (recommended)
export { useProviderStore, selectActiveProviders, selectInstances, selectMeetingInstances, selectAgentInstances } from './providerStore'

// Core stores
export { useAppStore } from './appStore'
export { useCallStore } from './callStore'
export { useAgentStore } from './agentStore'
export { useConfigStore } from './configStore'
export { useTabsStore, selectActiveTab, selectMeetingTabs } from './tabsStore'
export { useAgentProvidersStore } from './agentProvidersStore'
export { usePreferencesStore } from './preferencesStore'
export { useNavigationStore, type PageType } from './navigationStore'
export { useOnboardingStore, type OnboardingStep } from './onboardingStore'

// Agent Behavior Store
export { 
  useAgentBehaviorStore, 
  selectCurrentPattern, 
  selectPendingCount, 
  selectIsHandRaised 
} from './agentBehaviorStore'
export { 
  PRESET_PATTERNS, 
  DEFAULT_PATTERN_ID,
  getPresetPatternList,
  getPatternById,
  getPatternsByCategory
} from './presetPatterns'

// Secure storage
export { createSecureStorage, SecureStorageConfigs } from './secureStorage'
export {
  saveAgentCredentialsSecure,
  loadAgentCredentialsSecure,
  deleteAgentCredentialsSecure,
  loadAllAgentCredentials,
  extractSecureFields,
  stripSecureFields,
  mergeSecureFields
} from './agentCredentialHelpers'
