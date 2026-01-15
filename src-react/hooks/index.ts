// ============================================
// Hooks Index
// ============================================

// Provider initialization
export { useInitializeProviders } from './useInitializeProviders'

// New Provider-based hooks (recommended)
export { useMeetingProvider } from './useMeetingProvider'
export { useAgentProvider } from './useAgentProvider'
export { useSpeechProvider } from './useSpeechProvider'

// Unified meeting agent hook (recommended for all agent types)
export { useMeetingAgent, type MeetingAgentConfig, type MessageContext } from './useMeetingAgent'

// Behavior processing
export { useBehaviorProcessor } from './useBehaviorProcessor'

// Legacy hooks (for backward compatibility)
// Note: These require Tauri runtime and will fail in plain browser
export { useAcsCall } from './useAcsCall'
export { useTextToSpeech } from './useTextToSpeech'
export { useCallAnalytics } from './useCallAnalytics'
export { useMeetingChat, type MeetingChatState } from './useMeetingChat'

// Copilot hooks - export lazily as they require Tauri
export { useCopilotAuth } from './useCopilotAuth'
export { useCopilotAgent } from './useCopilotAgent'
