// ============================================
// Azure Speech Provider
// TTS provider implementation using Azure Cognitive Services Speech
// ============================================

import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk'

import { BaseProvider } from '../core/BaseProvider'
import type {
  AzureSpeechProviderConfig,
  ISpeechProvider,
  SpeechProviderType,
  SpeechSynthesisState,
  VoiceInfo,
  SpeechProviderCallbacks,
  SpeechSynthesisOptions,
  SpeechSynthesisResult,
  ProviderRegistration
} from '@/types/providers'

/**
 * Azure Speech Provider
 */
export class AzureSpeechProvider 
  extends BaseProvider<AzureSpeechProviderConfig> 
  implements ISpeechProvider {
  
  readonly type = 'azure-speech'
  readonly category = 'speech' as const
  readonly providerType: SpeechProviderType = 'azure-speech'

  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private callbacks: SpeechProviderCallbacks = {}
  
  private _synthesisState: SpeechSynthesisState = 'idle'
  private _availableVoices: VoiceInfo[] = []
  private _currentVoice: VoiceInfo | null = null

  get synthesisState(): SpeechSynthesisState {
    return this._synthesisState
  }

  get availableVoices(): VoiceInfo[] {
    return [...this._availableVoices]
  }

  get currentVoice(): VoiceInfo | null {
    return this._currentVoice
  }

  /**
   * Initialize the provider
   */
  protected async onInitialize(config: AzureSpeechProviderConfig): Promise<void> {
    console.log('🔊 Initializing Azure Speech Provider...')
    
    if (!config.settings.apiKey || !config.settings.region) {
      throw new Error('Azure Speech API key and region are required')
    }

    // Create audio context
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.audioContext = new AudioContextClass()
    this.gainNode = this.audioContext.createGain()
    this.gainNode.gain.value = 1.0

    // Set default voice
    if (config.settings.defaultVoice) {
      this._currentVoice = {
        id: config.settings.defaultVoice,
        name: config.settings.defaultVoice,
        displayName: config.settings.defaultVoice,
        language: 'en-US',
        locale: 'en-US',
        gender: 'female'
      }
    } else {
      this._currentVoice = {
        id: 'en-US-JennyNeural',
        name: 'en-US-JennyNeural',
        displayName: 'Jenny (Neural)',
        language: 'en-US',
        locale: 'en-US',
        gender: 'female'
      }
    }

    console.log('🔊 Azure Speech Provider initialized')
  }

  /**
   * Set callbacks for events
   */
  setCallbacks(callbacks: SpeechProviderCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Synthesize text to audio
   */
  async synthesize(text: string, options?: SpeechSynthesisOptions): Promise<SpeechSynthesisResult> {
    this.setSynthesisState('synthesizing')
    this.callbacks.onSynthesisStarted?.(text)

    try {
      const voiceName = options?.voiceName || this._currentVoice?.name || 'en-US-JennyNeural'
      
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
        this._config.settings.apiKey,
        this._config.settings.region
      )
      speechConfig.speechSynthesisVoiceName = voiceName

      // Apply options
      if (options?.rate) {
        // Rate is handled via SSML
      }

      const audioStream = SpeechSDK.AudioOutputStream.createPullStream()
      const audioConfig = SpeechSDK.AudioConfig.fromStreamOutput(audioStream)
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig)

      const result = await new Promise<SpeechSDK.SpeechSynthesisResult>((resolve, reject) => {
        const textToSpeak = options?.ssml ? text : text
        
        synthesizer.speakTextAsync(
          textToSpeak,
          result => {
            if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
              resolve(result)
            } else {
              reject(new Error(result.errorDetails || 'Speech synthesis failed'))
            }
          },
          error => reject(error)
        )
      })

      synthesizer.close()

      if (!result.audioData || result.audioData.byteLength === 0) {
        throw new Error('No audio data received')
      }

      const synthesisResult: SpeechSynthesisResult = {
        audioData: result.audioData,
        durationMs: result.audioDuration / 10000, // Convert from 100ns to ms
        voiceName,
        text
      }

      this.setSynthesisState('idle')
      this.callbacks.onSynthesisCompleted?.(synthesisResult)

      return synthesisResult
    } catch (error) {
      this.setSynthesisState('error')
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Synthesis failed'))
      throw error
    }
  }

  /**
   * Synthesize and play audio directly
   */
  async speak(text: string, options?: SpeechSynthesisOptions): Promise<void> {
    const result = await this.synthesize(text, options)
    await this.playAudioBuffer(result.audioData)
  }

  /**
   * Speak through a specific audio context (for call injection)
   */
  async speakToAudioContext(
    text: string,
    audioContext: AudioContext,
    destination: AudioNode,
    options?: SpeechSynthesisOptions
  ): Promise<void> {
    const result = await this.synthesize(text, options)
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    // Decode the audio data
    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await audioContext.decodeAudioData(result.audioData.slice(0))
    } catch {
      // Try with WAV header fallback
      const wavBuffer = this.createWavBuffer(result.audioData)
      audioBuffer = await audioContext.decodeAudioData(wavBuffer)
    }

    this.setSynthesisState('speaking')
    this.callbacks.onSpeakingStarted?.()

    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(destination)

    return new Promise((resolve) => {
      source.onended = () => {
        this.setSynthesisState('idle')
        this.callbacks.onSpeakingCompleted?.()
        resolve()
      }
      source.start(0)
    })
  }

  /**
   * Stop current synthesis/playback
   */
  stop(): void {
    if (this.currentSource) {
      this.currentSource.stop(0)
      this.currentSource = null
    }
    this.setSynthesisState('idle')
  }

  /**
   * Pause current playback
   */
  pause(): void {
    if (this.audioContext?.state === 'running') {
      this.audioContext.suspend()
      this.setSynthesisState('paused')
    }
  }

  /**
   * Resume paused playback
   */
  resume(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume()
      this.setSynthesisState('speaking')
    }
  }

  /**
   * Set the voice to use
   */
  setVoice(voiceName: string): void {
    const voice = this._availableVoices.find(v => v.name === voiceName)
    if (voice) {
      this._currentVoice = voice
    } else {
      this._currentVoice = {
        id: voiceName,
        name: voiceName,
        displayName: voiceName,
        language: 'en-US',
        locale: 'en-US',
        gender: 'neutral'
      }
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<VoiceInfo[]> {
    if (this._availableVoices.length > 0) {
      return this._availableVoices
    }

    // Fetch voices from Azure
    try {
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
        this._config.settings.apiKey,
        this._config.settings.region
      )
      
      const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig)
      const result = await synthesizer.getVoicesAsync()
      
      if (result.voices) {
        this._availableVoices = result.voices.map(v => ({
          id: v.shortName,
          name: v.shortName,
          displayName: v.localName,
          language: v.locale.split('-')[0],
          locale: v.locale,
          gender: v.gender === SpeechSDK.SynthesisVoiceGender.Male ? 'male' : 'female',
          style: v.styleList
        }))
      }
      
      synthesizer.close()
    } catch (error) {
      console.error('Failed to fetch voices:', error)
    }

    return this._availableVoices
  }

  /**
   * Preprocess text for TTS
   */
  async preprocessText(text: string): Promise<string> {
    // Basic preprocessing - can be enhanced with processor provider
    let cleaned = text

    // Remove citations
    cleaned = cleaned.replace(/\[\d+\]/g, '')
    cleaned = cleaned.replace(/\[doc\d+\]/gi, '')

    // Remove markdown formatting
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1')
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1')

    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s"]+/gi, '')
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, '')

    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, ' ')
    cleaned = cleaned.trim()

    return cleaned
  }

  /**
   * Dispose the provider
   */
  protected async onDispose(): Promise<void> {
    this.stop()
    if (this.audioContext) {
      await this.audioContext.close()
    }
    this.audioContext = null
    this.gainNode = null
  }

  // Private methods

  /**
   * Set synthesis state
   */
  private setSynthesisState(state: SpeechSynthesisState): void {
    if (this._synthesisState !== state) {
      this._synthesisState = state
      this.callbacks.onStateChanged?.(state)
      this.notifyStateChange()
    }
  }

  /**
   * Play audio buffer through local audio context
   */
  private async playAudioBuffer(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioContext || !this.gainNode) {
      throw new Error('Audio context not available')
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    // Decode the audio data
    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0))
    } catch {
      // Try with WAV header fallback
      const wavBuffer = this.createWavBuffer(audioData)
      audioBuffer = await this.audioContext.decodeAudioData(wavBuffer)
    }

    this.setSynthesisState('speaking')
    this.callbacks.onSpeakingStarted?.()

    const source = this.audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.gainNode)
    this.gainNode.connect(this.audioContext.destination)

    return new Promise((resolve) => {
      source.onended = () => {
        this.setSynthesisState('idle')
        this.callbacks.onSpeakingCompleted?.()
        resolve()
      }
      this.currentSource = source
      source.start(0)
    })
  }

  /**
   * Create WAV buffer from PCM data
   */
  private createWavBuffer(
    pcmData: ArrayBuffer,
    sampleRate = 16000,
    channels = 1,
    bitsPerSample = 16
  ): ArrayBuffer {
    const length = pcmData.byteLength
    const arrayBuffer = new ArrayBuffer(44 + length)
    const view = new DataView(arrayBuffer)

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true)
    view.setUint16(32, channels * bitsPerSample / 8, true)
    view.setUint16(34, bitsPerSample, true)
    writeString(36, 'data')
    view.setUint32(40, length, true)

    const uint8Array = new Uint8Array(arrayBuffer, 44)
    uint8Array.set(new Uint8Array(pcmData))

    return arrayBuffer
  }
}

/**
 * Factory function for creating Azure Speech provider
 */
export function createAzureSpeechProvider(
  _config?: Partial<AzureSpeechProviderConfig>
): AzureSpeechProvider {
  return new AzureSpeechProvider()
}

/**
 * Provider registration
 */
export const azureSpeechProviderRegistration: ProviderRegistration<
  AzureSpeechProvider,
  AzureSpeechProviderConfig
> = {
  type: 'azure-speech',
  category: 'speech',
  displayName: 'Azure Speech',
  description: 'Text-to-speech using Azure Cognitive Services',
  factory: createAzureSpeechProvider,
  capabilities: ['tts', 'ssml', 'multiple-voices', 'word-boundary'],
  requiredSettings: ['apiKey', 'region'],
  defaultConfig: {
    type: 'azure-speech',
    category: 'speech',
    authType: 'api-key'
  }
}
