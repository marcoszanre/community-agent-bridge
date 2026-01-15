// ============================================
// Processing Pipeline
// Manages pre and post-processing chains
// ============================================

import type {
  IProcessorProvider,
  ProcessingContext,
  ProcessingResult,
  ProcessingContextType,
  IntentDetectionResult
} from '@/types/providers'
import { ProviderRegistry } from './ProviderRegistry'

/**
 * Pipeline processor entry
 */
interface PipelineEntry {
  providerId: string
  contexts: ProcessingContextType[]
  priority: number
}

/**
 * Processing Pipeline - Manages chains of processors
 */
export class ProcessingPipeline {
  private preprocessors: PipelineEntry[] = []
  private postprocessors: PipelineEntry[] = []

  /**
   * Add a preprocessor to the pipeline
   */
  addPreprocessor(
    providerId: string,
    contexts: ProcessingContextType[] = ['user-input', 'caption'],
    priority: number = 100
  ): void {
    this.preprocessors.push({ providerId, contexts, priority })
    this.preprocessors.sort((a, b) => a.priority - b.priority)
    console.log(`🔧 Added preprocessor: ${providerId} (priority: ${priority})`)
  }

  /**
   * Add a postprocessor to the pipeline
   */
  addPostprocessor(
    providerId: string,
    contexts: ProcessingContextType[] = ['agent-response', 'tts-optimization'],
    priority: number = 100
  ): void {
    this.postprocessors.push({ providerId, contexts, priority })
    this.postprocessors.sort((a, b) => a.priority - b.priority)
    console.log(`🔧 Added postprocessor: ${providerId} (priority: ${priority})`)
  }

  /**
   * Remove a processor from the pipeline
   */
  removeProcessor(providerId: string): void {
    this.preprocessors = this.preprocessors.filter(p => p.providerId !== providerId)
    this.postprocessors = this.postprocessors.filter(p => p.providerId !== providerId)
    console.log(`🔧 Removed processor: ${providerId}`)
  }

  /**
   * Run preprocessing pipeline
   */
  async preprocess(context: ProcessingContext): Promise<ProcessingResult> {
    return this.runPipeline(this.preprocessors, context)
  }

  /**
   * Run postprocessing pipeline
   */
  async postprocess(context: ProcessingContext): Promise<ProcessingResult> {
    return this.runPipeline(this.postprocessors, context)
  }

  /**
   * Run the pipeline
   */
  private async runPipeline(
    pipeline: PipelineEntry[],
    context: ProcessingContext
  ): Promise<ProcessingResult> {
    let currentOutput = context.input
    let wasModified = false
    const startTime = Date.now()

    for (const entry of pipeline) {
      // Skip if this processor doesn't handle this context type
      if (!entry.contexts.includes(context.type)) {
        continue
      }

      const processor = ProviderRegistry.getInstance<IProcessorProvider>(entry.providerId)
      if (!processor) {
        console.warn(`Processor ${entry.providerId} not found, skipping`)
        continue
      }

      try {
        const result = await processor.process({
          ...context,
          input: currentOutput
        })

        if (result.wasModified) {
          currentOutput = result.output
          wasModified = true
        }
      } catch (error) {
        console.error(`Processor ${entry.providerId} failed:`, error)
        // Continue with other processors
      }
    }

    return {
      output: currentOutput,
      wasModified,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        processorsRun: pipeline.filter(p => p.contexts.includes(context.type)).length
      }
    }
  }

  /**
   * Specialized: Preprocess text for TTS
   */
  async preprocessForTTS(text: string, agentName?: string): Promise<string> {
    const result = await this.postprocess({
      type: 'tts-optimization',
      input: text,
      agentName
    })
    return result.output
  }

  /**
   * Specialized: Detect intent from caption
   */
  async detectIntent(
    text: string,
    speaker: string,
    agentName: string,
    history?: Array<{ role: string; content: string }>
  ): Promise<IntentDetectionResult> {
    // Find a processor that supports intent detection
    for (const entry of this.preprocessors) {
      const processor = ProviderRegistry.getInstance<IProcessorProvider>(entry.providerId)
      if (processor?.detectIntent) {
        try {
          return await processor.detectIntent({
            type: 'intent-detection',
            input: text,
            speaker,
            agentName,
            history
          })
        } catch (error) {
          console.error(`Intent detection failed with ${entry.providerId}:`, error)
        }
      }
    }

    // Fallback: basic keyword detection
    return this.fallbackIntentDetection(text, agentName)
  }

  /**
   * Fallback intent detection using keywords
   */
  private fallbackIntentDetection(text: string, agentName: string): IntentDetectionResult {
    const lowerText = text.toLowerCase()
    const lowerName = agentName.toLowerCase()
    const firstName = lowerName.split(' ')[0]

    // Check for name mentions
    const nameMatch = lowerText.includes(lowerName) || lowerText.includes(firstName)

    // Check for question indicators
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
          : 'No clear intent to address agent'
    }
  }

  /**
   * Clear all processors
   */
  clear(): void {
    this.preprocessors = []
    this.postprocessors = []
  }

  /**
   * Get pipeline configuration
   */
  getConfig() {
    return {
      preprocessors: [...this.preprocessors],
      postprocessors: [...this.postprocessors]
    }
  }
}

// Export singleton instance
export const processingPipeline = new ProcessingPipeline()
