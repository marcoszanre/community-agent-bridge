// Text-to-Speech Service
// Uses Azure Speech SDK to synthesize speech and inject into the call audio stream

import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk'
import OpenAI from 'openai'

export type SpeechState = 'idle' | 'synthesizing' | 'speaking' | 'error'

interface TTSConfig {
  speechKey: string
  speechRegion: string
  voiceName?: string
  openaiEndpoint?: string
  openaiApiKey?: string
  openaiDeployment?: string
}

// Global audio context for TTS injection (shared with ACS service)
declare global {
  interface Window {
    ttsAudioContext: AudioContext | null
    ttsGainNode: GainNode | null
    ttsDestination: MediaStreamAudioDestinationNode | null
    setAgentSpeaking?: (speaking: boolean) => void
  }
}

/**
 * TTS Preprocessor - Cleans text before TTS synthesis
 */
class TTSPreprocessor {
  private openai: OpenAI | null = null
  private deploymentName: string = ''
  private isEnabled: boolean = false

  initialize(config: Pick<TTSConfig, 'openaiEndpoint' | 'openaiApiKey' | 'openaiDeployment'>): boolean {
    if (!config.openaiApiKey || !config.openaiEndpoint) {
      console.warn('OpenAI not configured, using basic text cleanup only')
      this.isEnabled = false
      return false
    }

    try {
      this.openai = new OpenAI({
        baseURL: config.openaiEndpoint,
        apiKey: config.openaiApiKey,
        dangerouslyAllowBrowser: true
      })
      this.deploymentName = config.openaiDeployment || ''
      this.isEnabled = true
      console.log('TTS Preprocessor enabled with Azure OpenAI')
      return true
    } catch (error) {
      console.error('Failed to initialize TTS Preprocessor:', error)
      this.isEnabled = false
      return false
    }
  }

  /**
   * Preprocess text for TTS - removes citations, URLs, etc.
   */
  async preprocessForTTS(text: string): Promise<string> {
    // Always do basic cleanup first
    let cleaned = this.basicCleanup(text)

    if (!this.isEnabled || !this.openai) {
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
        model: this.deploymentName,
        temperature: 0.3,
        max_tokens: 1000
      })

      const aiCleaned = completion.choices[0]?.message?.content?.trim()
      if (aiCleaned && aiCleaned.length > 0) {
        return aiCleaned
      }
    } catch (error) {
      console.error('AI preprocessing failed, using basic cleanup:', error)
    }

    return cleaned
  }

  /**
   * Basic text cleanup without AI
   */
  private basicCleanup(text: string): string {
    let cleaned = text

    // Remove reference definitions: [1]: https://... "Title"
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

    // Remove markdown links [text](url)
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
}

/**
 * Text-to-Speech Service
 */
export class TextToSpeechService {
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private preprocessor = new TTSPreprocessor()

  private speechKey: string = ''
  private speechRegion: string = ''
  private voiceName: string = 'en-US-JennyNeural'
  
  // Speech rate: 0.5 = 50% slower, 1.0 = normal, 1.5 = 50% faster, 2.0 = double speed
  private _speechRate: number = 1.0

  private _isSpeaking: boolean = false
  private _state: SpeechState = 'idle'

  // Callbacks
  public onStateChanged: ((state: SpeechState, message?: string) => void) | null = null
  public onSpeakingFinished: (() => void) | null = null

  /**
   * Get the current speech rate
   */
  get speechRate(): number {
    return this._speechRate
  }

  /**
   * Set speech rate (0.5 = slow, 1.0 = normal, 1.5 = fast, 2.0 = very fast)
   */
  set speechRate(rate: number) {
    this._speechRate = Math.max(0.5, Math.min(2.0, rate))
    console.log(`Speech rate set to ${this._speechRate}`)
  }

  /**
   * Initialize the TTS service
   */
  async initialize(config: TTSConfig): Promise<boolean> {
    try {
      console.log('Initializing TTS service...')

      this.speechKey = config.speechKey
      this.speechRegion = config.speechRegion
      this.voiceName = config.voiceName || 'en-US-JennyNeural'

      if (!this.speechKey) {
        console.warn('Speech service key not configured. TTS will not work.')
        return false
      }

      // Create local audio context (for fallback/testing)
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioContext = new AudioContextClass()

      this.gainNode = this.audioContext.createGain()
      this.gainNode.gain.value = 1.0

      // Initialize preprocessor
      this.preprocessor.initialize({
        openaiEndpoint: config.openaiEndpoint,
        openaiApiKey: config.openaiApiKey,
        openaiDeployment: config.openaiDeployment
      })

      console.log('TTS service initialized successfully')
      return true
    } catch (error) {
      console.error('Failed to initialize TTS service:', error)
      return false
    }
  }

  /**
   * Build SSML with prosody rate control
   */
  private buildSSML(text: string): string {
    // Convert rate to percentage (1.0 = 0%, 1.5 = +50%, 0.5 = -50%)
    const ratePercent = Math.round((this._speechRate - 1.0) * 100)
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`
    
    // Escape XML special characters
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
    
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${this.voiceName}">
    <prosody rate="${rateStr}">${escapedText}</prosody>
  </voice>
</speak>`
  }

  /**
   * Synthesize text to speech
   */
  private async synthesizeSpeech(text: string): Promise<ArrayBuffer> {
    if (!this.speechKey) {
      throw new Error('Speech service not configured')
    }

    console.log(`Starting speech synthesis (rate: ${this._speechRate})...`)
    this.setState('synthesizing', 'Synthesizing speech...')

    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
      this.speechKey,
      this.speechRegion
    )
    // Voice is set in SSML, but set it here as fallback
    speechConfig.speechSynthesisVoiceName = this.voiceName

    const audioStream = SpeechSDK.AudioOutputStream.createPullStream()
    const audioConfig = SpeechSDK.AudioConfig.fromStreamOutput(audioStream)
    const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig)

    try {
      // Use SSML for rate control if rate is not 1.0
      const useSSML = this._speechRate !== 1.0
      const ssml = useSSML ? this.buildSSML(text) : null
      
      const result = await new Promise<SpeechSDK.SpeechSynthesisResult>((resolve, reject) => {
        const callback = (result: SpeechSDK.SpeechSynthesisResult) => {
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve(result)
          } else {
            reject(new Error(result.errorDetails || 'Speech synthesis failed'))
          }
        }
        
        if (useSSML && ssml) {
          synthesizer.speakSsmlAsync(ssml, callback, error => reject(error))
        } else {
          synthesizer.speakTextAsync(text, callback, error => reject(error))
        }
      })

      synthesizer.close()

      if (!result.audioData || result.audioData.byteLength === 0) {
        throw new Error('No audio data received')
      }

      console.log(`Synthesized ${result.audioData.byteLength} bytes of audio`)
      return result.audioData
    } catch (error) {
      synthesizer.close()
      throw error
    }
  }

  /**
   * Play audio buffer through the TTS stream (injected into call)
   */
  private async playAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    const context = window.ttsAudioContext || this.audioContext
    if (!context) {
      throw new Error('No audio context available')
    }

    this._isSpeaking = true
    this.setState('speaking', 'Speaking...')
    
    // Trigger visual feedback for the particle sphere
    window.setAgentSpeaking?.(true)

    // Use TTS audio stream if available (for call injection)
    if (window.ttsAudioContext && window.ttsGainNode && window.ttsDestination) {
      console.log('Injecting TTS audio into call stream')

      if (window.ttsAudioContext.state === 'suspended') {
        await window.ttsAudioContext.resume()
      }

      const source = window.ttsAudioContext.createBufferSource()
      source.buffer = audioBuffer

      // Set gain for playback
      window.ttsGainNode.gain.value = 1.0
      source.connect(window.ttsGainNode)

      source.onended = () => {
        window.ttsGainNode!.gain.value = 0
        this._isSpeaking = false
        this.setState('idle', 'Speech completed')
        window.setAgentSpeaking?.(false)
        this.onSpeakingFinished?.()
      }

      this.currentSource = source
      source.start(0)
      console.log('TTS audio injection started')
    } else {
      // Fallback to system speakers (for testing without call)
      console.log('Using system speakers fallback (not in call)')

      if (!this.audioContext || !this.gainNode) {
        throw new Error('Local audio context not available')
      }

      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.gainNode)
      this.gainNode.connect(this.audioContext.destination)

      source.onended = () => {
        this._isSpeaking = false
        this.setState('idle', 'Speech completed')
        window.setAgentSpeaking?.(false)
        this.onSpeakingFinished?.()
      }

      this.currentSource = source
      source.start(0)
    }
  }

  /**
   * Speak text with preprocessing and call integration
   */
  async speakText(text: string, options?: { 
    unmuteDuringPlayback?: boolean
    muteCallback?: () => Promise<void>
    unmuteCallback?: () => Promise<void>
  }): Promise<string> {
    try {
      // Preprocess text for TTS
      console.log('Original text:', text.substring(0, 100) + '...')
      const cleanedText = await this.preprocessor.preprocessForTTS(text)
      console.log('Cleaned text:', cleanedText.substring(0, 100) + '...')

      // Resume audio contexts if needed
      if (window.ttsAudioContext?.state === 'suspended') {
        await window.ttsAudioContext.resume()
      }
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume()
      }

      // Unmute for playback if requested
      if (options?.unmuteDuringPlayback && options.unmuteCallback) {
        await options.unmuteCallback()
      }

      // Set up re-mute callback
      if (options?.unmuteDuringPlayback && options.muteCallback) {
        this.onSpeakingFinished = async () => {
          try {
            await options.muteCallback!()
          } catch (error) {
            console.warn('Failed to re-mute:', error)
          }
        }
      }

      // Synthesize and play
      const audioData = await this.synthesizeSpeech(cleanedText)
      this.setState('speaking', 'Sending to meeting...')

      const contextToUse = window.ttsAudioContext || this.audioContext
      if (!contextToUse) {
        throw new Error('No audio context available')
      }

      try {
        const audioBuffer = await contextToUse.decodeAudioData(audioData.slice(0))
        await this.playAudioBuffer(audioBuffer)
      } catch {
        // Try with WAV header fallback
        console.log('Trying WAV header fallback...')
        const wavBuffer = this.createWavBuffer(audioData)
        const audioBuffer = await contextToUse.decodeAudioData(wavBuffer)
        await this.playAudioBuffer(audioBuffer)
      }

      return cleanedText
    } catch (error) {
      console.error('Error in speakText:', error)
      this.setState('error', error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  /**
   * Stop current playback
   */
  stop(): void {
    if (this.currentSource) {
      this.currentSource.stop(0)
      this.currentSource = null
    }
    if (window.ttsGainNode) {
      window.ttsGainNode.gain.value = 0
    }
    this._isSpeaking = false
    this.setState('idle')
    window.setAgentSpeaking?.(false)
  }

  /**
   * Check if speaking
   */
  isSpeaking(): boolean {
    return this._isSpeaking
  }

  /**
   * Get current state
   */
  getState(): SpeechState {
    return this._state
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    const safeVolume = Math.max(0, Math.min(1, volume))
    if (this.gainNode) {
      this.gainNode.gain.value = safeVolume
    }
  }

  private setState(state: SpeechState, message?: string): void {
    this._state = state
    this.onStateChanged?.(state, message)
  }

  /**
   * Create WAV buffer from PCM data (fallback for decoding)
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

    // RIFF header
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length, true)
    writeString(8, 'WAVE')

    // fmt chunk
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM format
    view.setUint16(22, channels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true)
    view.setUint16(32, channels * bitsPerSample / 8, true)
    view.setUint16(34, bitsPerSample, true)

    // data chunk
    writeString(36, 'data')
    view.setUint32(40, length, true)

    // Copy PCM data
    const uint8Array = new Uint8Array(arrayBuffer, 44)
    uint8Array.set(new Uint8Array(pcmData))

    return arrayBuffer
  }

  /**
   * Dispose of the service
   */
  dispose(): void {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.gainNode = null
  }
}

// Singleton instance
let instance: TextToSpeechService | null = null

export function getTextToSpeechService(): TextToSpeechService {
  if (!instance) {
    instance = new TextToSpeechService()
  }
  return instance
}
