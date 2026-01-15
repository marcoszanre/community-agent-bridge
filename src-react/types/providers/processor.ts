// ============================================
// Processor Provider Types
// Interfaces for pre/post processing (LLMs, rules, etc.)
// ============================================

import type { 
  BaseProviderConfig, 
  IProvider 
} from './base'

/**
 * Processor provider types
 */
export type ProcessorProviderType = 
  | 'azure-openai'      // Azure OpenAI for processing
  | 'openai'            // OpenAI API
  | 'anthropic'         // Anthropic Claude
  | 'rules-based'       // Rule-based processor
  | 'custom'            // Custom processor

/**
 * Processing context types
 */
export type ProcessingContextType = 
  | 'user-input'        // Processing user input before sending to agent
  | 'agent-response'    // Processing agent response before TTS
  | 'caption'           // Processing meeting caption
  | 'tts-optimization'  // Optimizing text for TTS
  | 'intent-detection'  // Detecting user intent

/**
 * Processing context
 */
export interface ProcessingContext {
  type: ProcessingContextType
  /** Original input text */
  input: string
  /** Speaker name (for captions) */
  speaker?: string
  /** Agent name (for context) */
  agentName?: string
  /** Recent conversation history */
  history?: Array<{ role: string; content: string }>
  /** Custom context data */
  metadata?: Record<string, unknown>
}

/**
 * Processing result
 */
export interface ProcessingResult {
  /** Processed output text */
  output: string
  /** Whether output was modified */
  wasModified: boolean
  /** Processing metadata */
  metadata?: {
    /** Confidence score if applicable */
    confidence?: number
    /** Processing time in ms */
    processingTimeMs?: number
    /** Tokens used (for LLM processors) */
    tokensUsed?: number
    /** Additional info */
    [key: string]: unknown
  }
}

/**
 * Intent detection result
 */
export interface IntentDetectionResult {
  /** Whether the agent should respond */
  shouldRespond: boolean
  /** Detected intent */
  intent?: string
  /** Confidence score */
  confidence: number
  /** Explanation */
  reason: string
  /** Extracted entities */
  entities?: Record<string, string>
}

/**
 * Processor provider configuration
 */
export interface ProcessorProviderConfig extends BaseProviderConfig {
  category: 'processor'
  settings: {
    /** API endpoint */
    endpoint?: string
    /** API key */
    apiKey?: string
    /** Model/deployment name */
    model?: string
    /** Temperature for LLM processors */
    temperature?: number
    /** Max tokens */
    maxTokens?: number
    /** System prompt for LLM processors */
    systemPrompt?: string
    /** Processing rules for rules-based processors */
    rules?: ProcessingRule[]
    /** Additional provider-specific settings */
    [key: string]: unknown
  }
}

/**
 * Processing rule for rules-based processors
 */
export interface ProcessingRule {
  id: string
  name: string
  enabled: boolean
  /** Regex pattern to match */
  pattern: string
  /** Replacement text (supports capture groups) */
  replacement: string
  /** Context types this rule applies to */
  contexts?: ProcessingContextType[]
  /** Order of execution */
  priority?: number
}

/**
 * Azure OpenAI processor configuration
 */
export interface AzureOpenAIProcessorConfig extends ProcessorProviderConfig {
  type: 'azure-openai'
  authType: 'api-key'
  settings: ProcessorProviderConfig['settings'] & {
    endpoint: string
    apiKey: string
    deploymentName: string
    temperature?: number
    maxTokens?: number
  }
}

/**
 * Rules-based processor configuration
 */
export interface RulesBasedProcessorConfig extends ProcessorProviderConfig {
  type: 'rules-based'
  authType: 'none'
  settings: ProcessorProviderConfig['settings'] & {
    rules: ProcessingRule[]
  }
}

/**
 * Processor provider event callbacks
 */
export interface ProcessorProviderCallbacks {
  onProcessingStarted?: (context: ProcessingContext) => void
  onProcessingCompleted?: (result: ProcessingResult) => void
  onError?: (error: Error) => void
}

/**
 * Processor provider interface
 */
export interface IProcessorProvider extends IProvider<ProcessorProviderConfig> {
  readonly category: 'processor'
  readonly providerType: ProcessorProviderType
  
  /** Supported context types */
  readonly supportedContexts: ProcessingContextType[]
  
  /** Set callbacks for events */
  setCallbacks(callbacks: ProcessorProviderCallbacks): void
  
  /** Process text */
  process(context: ProcessingContext): Promise<ProcessingResult>
  
  /** Detect intent (specialized method) */
  detectIntent?(context: ProcessingContext): Promise<IntentDetectionResult>
  
  /** Preprocess text for TTS */
  preprocessForTTS?(text: string): Promise<string>
  
  /** Post-process agent response */
  postprocessResponse?(text: string): Promise<string>
  
  /** Add a processing rule (for rules-based processors) */
  addRule?(rule: ProcessingRule): void
  
  /** Remove a processing rule */
  removeRule?(ruleId: string): void
  
  /** Get all rules */
  getRules?(): ProcessingRule[]
}

/**
 * Processor provider factory configuration
 */
export interface ProcessorProviderFactoryConfig {
  type: ProcessorProviderType
  displayName: string
  description: string
  requiredSettings: (keyof ProcessorProviderConfig['settings'])[]
  supportedContexts: ProcessingContextType[]
  supportsStreaming: boolean
  supportsRules: boolean
}

/**
 * Processing pipeline configuration
 */
export interface ProcessingPipelineConfig {
  /** Pre-processors to run before sending to agent */
  preprocessors: Array<{
    providerId: string
    contexts: ProcessingContextType[]
    priority: number
  }>
  /** Post-processors to run on agent response */
  postprocessors: Array<{
    providerId: string
    contexts: ProcessingContextType[]
    priority: number
  }>
}
