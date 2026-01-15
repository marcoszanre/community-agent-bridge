// ============================================
// Rules-Based Processor Provider
// Simple rules-based text processing
// ============================================

import { BaseProvider } from '../core/BaseProvider'
import type {
  RulesBasedProcessorConfig,
  IProcessorProvider,
  ProcessorProviderType,
  ProcessingContextType,
  ProcessingContext,
  ProcessingResult,
  ProcessingRule,
  IntentDetectionResult,
  ProcessorProviderCallbacks,
  ProviderRegistration
} from '@/types/providers'

/**
 * Default processing rules
 */
const defaultRules: ProcessingRule[] = [
  // Citation removal
  {
    id: 'remove-citations-bracket',
    name: 'Remove bracketed citations',
    enabled: true,
    pattern: '\\[\\d+\\]',
    replacement: '',
    contexts: ['tts-optimization', 'agent-response'],
    priority: 10
  },
  {
    id: 'remove-citations-doc',
    name: 'Remove doc citations',
    enabled: true,
    pattern: '\\[doc\\d+\\]',
    replacement: '',
    contexts: ['tts-optimization', 'agent-response'],
    priority: 10
  },
  // URL removal
  {
    id: 'remove-urls',
    name: 'Remove URLs',
    enabled: true,
    pattern: 'https?:\\/\\/[^\\s"]+',
    replacement: '',
    contexts: ['tts-optimization'],
    priority: 20
  },
  // Markdown removal
  {
    id: 'remove-bold',
    name: 'Remove bold markdown',
    enabled: true,
    pattern: '\\*\\*([^*]+)\\*\\*',
    replacement: '$1',
    contexts: ['tts-optimization', 'agent-response'],
    priority: 30
  },
  {
    id: 'remove-italic',
    name: 'Remove italic markdown',
    enabled: true,
    pattern: '\\*([^*]+)\\*',
    replacement: '$1',
    contexts: ['tts-optimization', 'agent-response'],
    priority: 30
  },
  // Markdown links
  {
    id: 'remove-md-links',
    name: 'Convert markdown links to text',
    enabled: true,
    pattern: '\\[([^\\]]+)\\]\\([^)]+\\)',
    replacement: '$1',
    contexts: ['tts-optimization', 'agent-response'],
    priority: 25
  },
  // HTML tags
  {
    id: 'remove-html',
    name: 'Remove HTML tags',
    enabled: true,
    pattern: '<[^>]*>',
    replacement: '',
    contexts: ['tts-optimization', 'agent-response'],
    priority: 40
  },
  // Whitespace cleanup
  {
    id: 'cleanup-whitespace',
    name: 'Clean up whitespace',
    enabled: true,
    pattern: '\\s+',
    replacement: ' ',
    contexts: ['tts-optimization', 'agent-response'],
    priority: 100
  }
]

/**
 * Rules-Based Processor Provider
 */
export class RulesBasedProcessorProvider 
  extends BaseProvider<RulesBasedProcessorConfig> 
  implements IProcessorProvider {
  
  readonly type = 'rules-based'
  readonly category = 'processor' as const
  readonly providerType: ProcessorProviderType = 'rules-based'

  readonly supportedContexts: ProcessingContextType[] = [
    'user-input',
    'agent-response',
    'tts-optimization'
  ]

  private rules: ProcessingRule[] = []
  private callbacks: ProcessorProviderCallbacks = {}

  /**
   * Initialize the provider
   */
  protected async onInitialize(config: RulesBasedProcessorConfig): Promise<void> {
    console.log('📏 Initializing Rules-Based Processor Provider...')
    
    // Use provided rules or defaults
    this.rules = config.settings.rules?.length 
      ? [...config.settings.rules]
      : [...defaultRules]

    // Sort by priority
    this.rules.sort((a, b) => (a.priority || 100) - (b.priority || 100))

    console.log(`📏 Rules-Based Processor initialized with ${this.rules.length} rules`)
  }

  /**
   * Set callbacks for events
   */
  setCallbacks(callbacks: ProcessorProviderCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Process text using rules
   */
  async process(context: ProcessingContext): Promise<ProcessingResult> {
    this.callbacks.onProcessingStarted?.(context)
    const startTime = Date.now()

    let output = context.input
    let wasModified = false

    // Apply rules in order
    for (const rule of this.rules) {
      // Skip disabled rules
      if (!rule.enabled) continue

      // Skip if rule doesn't apply to this context
      if (rule.contexts && !rule.contexts.includes(context.type)) continue

      try {
        const regex = new RegExp(rule.pattern, 'gi')
        const newOutput = output.replace(regex, rule.replacement)
        
        if (newOutput !== output) {
          output = newOutput
          wasModified = true
        }
      } catch (error) {
        console.warn(`Rule ${rule.id} failed:`, error)
      }
    }

    // Final cleanup
    output = output.trim()

    const result: ProcessingResult = {
      output,
      wasModified,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        rulesApplied: this.rules.filter(r => r.enabled).length
      }
    }

    this.callbacks.onProcessingCompleted?.(result)
    return result
  }

  /**
   * Detect intent (basic implementation)
   */
  async detectIntent(context: ProcessingContext): Promise<IntentDetectionResult> {
    const { input, agentName } = context
    const lowerText = input.toLowerCase()
    const lowerName = (agentName || '').toLowerCase()
    const firstName = lowerName.split(' ')[0]

    const nameMatch = lowerName && (
      lowerText.includes(lowerName) || 
      (firstName && lowerText.includes(firstName))
    )

    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does']
    const isQuestion = input.includes('?') || questionWords.some(w => lowerText.startsWith(w + ' '))

    const shouldRespond = nameMatch || isQuestion

    return {
      shouldRespond,
      confidence: shouldRespond ? 0.6 : 0.4,
      reason: nameMatch 
        ? 'Agent name mentioned' 
        : isQuestion 
          ? 'Question detected' 
          : 'No clear intent'
    }
  }

  /**
   * Preprocess text for TTS
   */
  async preprocessForTTS(text: string): Promise<string> {
    const result = await this.process({
      type: 'tts-optimization',
      input: text
    })
    return result.output
  }

  /**
   * Post-process agent response
   */
  async postprocessResponse(text: string): Promise<string> {
    const result = await this.process({
      type: 'agent-response',
      input: text
    })
    return result.output
  }

  /**
   * Add a processing rule
   */
  addRule(rule: ProcessingRule): void {
    // Remove existing rule with same ID
    this.removeRule(rule.id)
    
    // Add new rule
    this.rules.push(rule)
    
    // Re-sort by priority
    this.rules.sort((a, b) => (a.priority || 100) - (b.priority || 100))
  }

  /**
   * Remove a processing rule
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId)
  }

  /**
   * Get all rules
   */
  getRules(): ProcessingRule[] {
    return [...this.rules]
  }

  /**
   * Dispose the provider
   */
  protected async onDispose(): Promise<void> {
    this.rules = []
  }
}

/**
 * Factory function for creating rules-based processor
 */
export function createRulesBasedProcessorProvider(
  _config?: Partial<RulesBasedProcessorConfig>
): RulesBasedProcessorProvider {
  return new RulesBasedProcessorProvider()
}

/**
 * Provider registration
 */
export const rulesBasedProcessorProviderRegistration: ProviderRegistration<
  RulesBasedProcessorProvider,
  RulesBasedProcessorConfig
> = {
  type: 'rules-based',
  category: 'processor',
  displayName: 'Rules-Based Processor',
  description: 'Simple rules-based text processing using regex patterns',
  factory: createRulesBasedProcessorProvider,
  capabilities: ['tts-preprocessing', 'response-postprocessing', 'custom-rules'],
  requiredSettings: [],
  defaultConfig: {
    type: 'rules-based',
    category: 'processor',
    authType: 'none'
  }
}

// Export default rules for external use
export { defaultRules }
