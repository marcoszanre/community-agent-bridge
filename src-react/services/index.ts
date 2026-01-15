// Services Index

export { getCopilotAuthService, initCopilotAuth, CopilotAuthService } from './copilotAuthService'
export { getCopilotService, CopilotService } from './copilotService'
export { getAcsCallService, AcsCallService } from './acsService'
export { getTextToSpeechService, TextToSpeechService, type SpeechState } from './ttsService'
export { 
  getCallAnalyticsService, 
  CallAnalyticsService, 
  type CallAnalytics, 
  type CallStats,
  type TopQuestion 
} from './analyticsService'
export {
  getIntentDetectionService,
  type IntentConfig,
  type ConversationContext,
  type IntentResult
} from './intentDetectionService'
export {
  getCaptionAggregationService,
  type CaptionEntry,
  type AggregatedCaption,
  type MentionResult,
  type PendingMention,
  type GptConfig
} from './captionAggregationService'
export {
  BehaviorProcessor,
  getBehaviorProcessor,
  disposeBehaviorProcessor,
  type BehaviorProcessorConfig,
  type TriggerContext,
  type GeneratedResponse,
  type ResponseGenerator,
  type ChatSender,
  type SpeechSender
} from './behaviorProcessor'

export {
  getMeetingChatService,
  MeetingChatService,
  type MeetingChatMessage,
  type ChatServiceCallbacks
} from './chatService'

export {
  validateAcsConfig,
  validateSpeechConfig,
  validateOpenAIConfig,
  validateCopilotStudioConfig,
  validateCopilotStudioAnonConfig,
  validateAzureFoundryConfig,
  validateAllServices,
  type ValidationResult
} from './validationService'

export {
  storeCredential,
  getCredential,
  deleteCredential,
  storeCredentialsBatch,
  getCredentialsBatch,
  deleteCredentialsBatch,
  storeServiceCredentials,
  getServiceCredentials,
  deleteServiceCredentials,
  storeAgentCredentials,
  getAgentCredentials,
  deleteAgentCredentials,
  isCredentialServiceAvailable,
  CredentialKeys,
  SECURE_AGENT_FIELDS
} from './credentialService'
