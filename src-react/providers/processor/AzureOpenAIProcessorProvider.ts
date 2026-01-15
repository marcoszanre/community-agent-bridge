// ============================================
// Azure OpenAI Processor Provider
// Pre/post processing using Azure OpenAI
// ============================================

import OpenAI from 'openai'

import { BaseProvider } from '../core/BaseProvider'
import type {
  AzureOpenAIProcessorConfig,
  IProcessorProvider,
  ProcessorProviderType,
  ProcessingContextType,
  ProcessingContext,
  ProcessingResult,
  IntentDetectionResult,
  ProcessorProviderCallbacks,
  ProviderRegistration
} from '@/types/providers'

/**
 * Azure OpenAI Processor Provider
 */
export class AzureOpenAIProcessorProvider 
  extends BaseProvider<AzureOpenAIProcessorConfig> 
  implements IProcessorProvider {
  
  readonly type = 'azure-openai'
  readonly category = 'processor' as const
  readonly providerType: ProcessorProviderType = 'azure-openai'

  readonly supportedContexts: ProcessingContextType[] = [
    'user-input',
    'agent-response',
    'caption',
    'tts-optimization',
    'intent-detection'
  ]

  private openai: OpenAI | null = null
  private callbacks: ProcessorProviderCallbacks = {}

  /**
   * Initialize the provider
   */
  protected async onInitialize(config: AzureOpenAIProcessorConfig): Promise<void> {
    console.log('🧠 Initializing Azure OpenAI Processor Provider...')
    
    const { endpoint, apiKey, deploymentName } = config.settings
    
    if (!endpoint || !apiKey || !deploymentName) {
      throw new Error('Azure OpenAI endpoint, API key, and deployment name are required')
    }

    this.openai = new OpenAI({
      baseURL: endpoint,
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    })

    console.log('🧠 Azure OpenAI Processor Provider initialized')
  }

  /**
   * Set callbacks for events
   */
  setCallbacks(callbacks: ProcessorProviderCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Process text based on context type
   */
  async process(context: ProcessingContext): Promise<ProcessingResult> {
    this.callbacks.onProcessingStarted?.(context)
    const startTime = Date.now()

    try {
      let output: string

      switch (context.type) {
        case 'tts-optimization':
          output = await this.preprocessForTTS(context.input)
          break
        case 'intent-detection':
          // For intent detection, use the specialized method
          const intentResult = await this.detectIntent(context)
          return {
            output: JSON.stringify(intentResult),
            wasModified: true,
            metadata: {
              processingTimeMs: Date.now() - startTime,
              type: 'intent-detection'
            }
          }
        case 'agent-response':
          output = await this.postprocessResponse(context.input)
          break
        default:
          output = context.input
      }

      const result: ProcessingResult = {
        output,
        wasModified: output !== context.input,
        metadata: {
          processingTimeMs: Date.now() - startTime
        }
      }

      this.callbacks.onProcessingCompleted?.(result)
      return result
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Processing failed'))
      throw error
    }
  }

  /**
   * Detect intent from text
   */
  async detectIntent(context: ProcessingContext): Promise<IntentDetectionResult> {
    if (!this.openai) {
      throw new Error('Provider not initialized')
    }

    const { input, speaker, agentName, history } = context

    const recentContext = history
      ?.slice(-5)
      .map(h => `${h.role}: ${h.content}`)
      .join('\n') || ''

    const systemPrompt = `You are an intent detection system for a voice AI agent named "${agentName || 'AI Agent'}".

Your task: Determine if the agent should respond to the latest message.

RESPOND = YES when:
- The agent's name is mentioned
- It's a question (direct or indirect)
- It's a request for information, help, or action
- It's a follow-up to an ongoing conversation with the agent
- Someone asks for clarification or more details

RESPOND = NO when:
- It's casual conversation between other participants not involving the agent
- It's a simple acknowledgment like "okay", "thanks", "got it"
- It's clearly directed at someone else
- It's just background chatter

Output ONLY valid JSON: {"shouldRespond": true/false, "reason": "brief explanation", "confidence": 0.0-1.0}`

    const userPrompt = `Recent conversation:
${recentContext || '(no recent context)'}

Latest message from ${speaker || 'Unknown'}:
"${input}"

Should the agent respond?`

    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: this._config.settings.deploymentName,
        temperature: this._config.settings.temperature ?? 0.1,
        max_tokens: this._config.settings.maxTokens ?? 150
      })

      const responseText = completion.choices[0]?.message?.content?.trim() || ''
      
      try {
        const result = JSON.parse(responseText) as IntentDetectionResult
        console.log('🧠 Intent detection result:', result)
        return result
      } catch {
        // Try to extract from non-JSON response
        const shouldRespond = responseText.toLowerCase().includes('"shouldrespond": true') ||
                             responseText.toLowerCase().includes('"shouldrespond":true')
        return {
          shouldRespond,
          reason: 'Parsed from response',
          confidence: 0.5
        }
      }
    } catch (error) {
      console.error('Intent detection error:', error)
      // Fallback to basic detection
      return this.fallbackIntentDetection(input, agentName || 'AI Agent')
    }
  }

  /**
   * Preprocess text for TTS
   */
  async preprocessForTTS(text: string): Promise<string> {
    // First do basic cleanup
    let cleaned = this.basicCleanup(text)

    if (!this.openai) {
      return cleaned
    }

    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a text-to-speech preprocessor. Transform the input text into natural spoken language.

REMOVE COMPLETELY:
- Citation markers like [1], [2], [doc1]
- ALL URLs
- Reference sections
- HTML tags, Markdown formatting

CONVERT TO NATURAL SPEECH:
- Dates: "Dec. 16" → "December 16th"
- Abbreviations: expand when appropriate
- Special characters: & → "and", % → "percent"

OUTPUT: Return ONLY the clean, natural text. No explanations.`
          },
          { role: 'user', content: text }
        ],
        model: this._config.settings.deploymentName,
        temperature: 0.3,
        max_tokens: 1000
      })

      const aiCleaned = completion.choices[0]?.message?.content?.trim()
      if (aiCleaned && aiCleaned.length > 0) {
        return aiCleaned
      }
    } catch (error) {
      console.error('AI preprocessing failed:', error)
    }

    return cleaned
  }

  /**
   * Post-process agent response
   */
  async postprocessResponse(text: string): Promise<string> {
    // For now, just do basic cleanup
    // Can be enhanced with AI-based formatting
    return this.basicCleanup(text)
  }

  /**
   * Dispose the provider
   */
  protected async onDispose(): Promise<void> {
    this.openai = null
  }

  // Private methods

  /**
   * Basic text cleanup without AI
   */
  private basicCleanup(text: string): string {
    let cleaned = text

    // Remove reference definitions
    cleaned = cleaned.replace(/\[\d+\]:\s*https?:\/\/[^\s]+\s*"[^"]*"/g, '')
    cleaned = cleaned.replace(/\[\d+\]:\s*https?:\/\/[^\s]+/g, '')

    // Remove inline citations
    cleaned = cleaned.replace(/\u200B?\[\d+\]\u200B?/g, '')
    cleaned = cleaned.replace(/\[\d+\]/g, '')
    cleaned = cleaned.replace(/\[doc\d+\]/gi, '')

    // Remove markdown formatting
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1')
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1')

    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s"]+/gi, '')
    cleaned = cleaned.replace(/www\.[^\s"]+/gi, '')

    // Remove markdown links
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, '')

    // Expand common abbreviations
    const months: Record<string, string> = {
      'Jan.': 'January', 'Feb.': 'February', 'Mar.': 'March',
      'Apr.': 'April', 'Jun.': 'June', 'Jul.': 'July',
      'Aug.': 'August', 'Sep.': 'September', 'Oct.': 'October',
      'Nov.': 'November', 'Dec.': 'December'
    }
    for (const [abbr, full] of Object.entries(months)) {
      cleaned = cleaned.replace(new RegExp(`\\b${abbr}\\s*`, 'gi'), full + ' ')
    }

    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, ' ')
    cleaned = cleaned.replace(/\s+([.,!?])/g, '$1')
    cleaned = cleaned.replace(/([.,!?])\s*([.,!?])+/g, '$1')
    cleaned = cleaned.trim()

    return cleaned
  }

  /**
   * Fallback intent detection
   */
  private fallbackIntentDetection(text: string, agentName: string): IntentDetectionResult {
    const lowerText = text.toLowerCase()
    const lowerName = agentName.toLowerCase()
    const firstName = lowerName.split(' ')[0]

    const nameMatch = lowerText.includes(lowerName) || lowerText.includes(firstName)
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does']
    const isQuestion = text.includes('?') || questionWords.some(w => lowerText.startsWith(w + ' '))

    const shouldRespond = nameMatch || isQuestion
    
    return {
      shouldRespond,
      confidence: shouldRespond ? 0.7 : 0.3,
      reason: nameMatch 
        ? 'Agent name mentioned' 
        : isQuestion 
          ? 'Question detected' 
          : 'No clear intent'
    }
  }
}

/**
 * Factory function for creating Azure OpenAI processor
 */
export function createAzureOpenAIProcessorProvider(
  _config?: Partial<AzureOpenAIProcessorConfig>
): AzureOpenAIProcessorProvider {
  return new AzureOpenAIProcessorProvider()
}

/**
 * Provider registration
 */
export const azureOpenAIProcessorProviderRegistration: ProviderRegistration<
  AzureOpenAIProcessorProvider,
  AzureOpenAIProcessorConfig
> = {
  type: 'azure-openai-processor',
  category: 'processor',
  displayName: 'Azure OpenAI Processor',
  description: 'Pre/post processing using Azure OpenAI for intent detection and TTS optimization',
  factory: createAzureOpenAIProcessorProvider,
  capabilities: ['intent-detection', 'tts-preprocessing', 'response-postprocessing'],
  requiredSettings: ['endpoint', 'apiKey', 'deploymentName'],
  defaultConfig: {
    type: 'azure-openai',
    category: 'processor',
    authType: 'api-key'
  }
}
