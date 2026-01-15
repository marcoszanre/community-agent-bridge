// ============================================
// Speech Provider Types
// Interfaces for TTS and STT services
// ============================================

import type { 
  BaseProviderConfig, 
  IProvider
} from './base'

/**
 * Speech provider types
 */
export type SpeechProviderType = 
  | 'azure-speech'    // Azure Cognitive Services Speech
  | 'google-speech'   // Google Cloud Speech
  | 'aws-polly'       // Amazon Polly
  | 'elevenlabs'      // ElevenLabs
  | 'openai-tts'      // OpenAI TTS
  | 'custom'          // Custom speech provider

/**
 * Speech synthesis state
 */
export type SpeechSynthesisState = 
  | 'idle'
  | 'synthesizing'
  | 'speaking'
  | 'paused'
  | 'error'

/**
 * Voice information
 */
export interface VoiceInfo {
  id: string
  name: string
  displayName: string
  language: string
  locale: string
  gender: 'male' | 'female' | 'neutral'
  style?: string[]
  sampleRate?: number
}

/**
 * Speech synthesis options
 */
export interface SpeechSynthesisOptions {
  /** Voice to use */
  voiceName?: string
  /** Speech rate (0.5 to 2.0, default 1.0) */
  rate?: number
  /** Pitch adjustment (-10 to +10, default 0) */
  pitch?: number
  /** Volume (0 to 1, default 1) */
  volume?: number
  /** Output format */
  outputFormat?: string
  /** Language code */
  language?: string
  /** Use SSML input */
  ssml?: boolean
}

/**
 * Speech synthesis result
 */
export interface SpeechSynthesisResult {
  /** Audio data as ArrayBuffer */
  audioData: ArrayBuffer
  /** Audio duration in milliseconds */
  durationMs: number
  /** Voice used */
  voiceName: string
  /** Text that was synthesized */
  text: string
}

/**
 * Speech recognition result
 */
export interface SpeechRecognitionResult {
  text: string
  confidence: number
  isFinal: boolean
  language?: string
  alternatives?: Array<{ text: string; confidence: number }>
}

/**
 * Speech provider configuration
 */
export interface SpeechProviderConfig extends BaseProviderConfig {
  category: 'speech'
  settings: {
    /** API key or subscription key */
    apiKey?: string
    /** Service region */
    region?: string
    /** Custom endpoint URL */
    endpoint?: string
    /** Default voice name */
    defaultVoice?: string
    /** Default language */
    defaultLanguage?: string
    /** Additional provider-specific settings */
    [key: string]: unknown
  }
}

/**
 * Azure Speech specific configuration
 */
export interface AzureSpeechProviderConfig extends SpeechProviderConfig {
  type: 'azure-speech'
  authType: 'api-key'
  settings: SpeechProviderConfig['settings'] & {
    apiKey: string
    region: string
    defaultVoice?: string
  }
}

/**
 * OpenAI TTS specific configuration
 */
export interface OpenAITTSProviderConfig extends SpeechProviderConfig {
  type: 'openai-tts'
  authType: 'api-key'
  settings: SpeechProviderConfig['settings'] & {
    apiKey: string
    endpoint?: string
    model?: 'tts-1' | 'tts-1-hd'
    defaultVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  }
}

/**
 * Speech provider event callbacks
 */
export interface SpeechProviderCallbacks {
  onSynthesisStarted?: (text: string) => void
  onSynthesisCompleted?: (result: SpeechSynthesisResult) => void
  onSpeakingStarted?: () => void
  onSpeakingCompleted?: () => void
  onWordBoundary?: (word: string, offset: number) => void
  onError?: (error: Error) => void
  onStateChanged?: (state: SpeechSynthesisState) => void
}

/**
 * Speech provider interface
 */
export interface ISpeechProvider extends IProvider<SpeechProviderConfig> {
  readonly category: 'speech'
  readonly providerType: SpeechProviderType
  
  /** Current synthesis state */
  readonly synthesisState: SpeechSynthesisState
  
  /** Available voices */
  readonly availableVoices: VoiceInfo[]
  
  /** Currently selected voice */
  readonly currentVoice: VoiceInfo | null
  
  /** Set callbacks for events */
  setCallbacks(callbacks: SpeechProviderCallbacks): void
  
  /** Synthesize text to audio */
  synthesize(text: string, options?: SpeechSynthesisOptions): Promise<SpeechSynthesisResult>
  
  /** Synthesize and play audio directly */
  speak(text: string, options?: SpeechSynthesisOptions): Promise<void>
  
  /** Speak through a specific audio context (for call injection) */
  speakToAudioContext(
    text: string, 
    audioContext: AudioContext,
    destination: AudioNode,
    options?: SpeechSynthesisOptions
  ): Promise<void>
  
  /** Stop current synthesis */
  stop(): void
  
  /** Pause current playback */
  pause(): void
  
  /** Resume paused playback */
  resume(): void
  
  /** Set the voice to use */
  setVoice(voiceName: string): void
  
  /** Get available voices */
  getVoices(): Promise<VoiceInfo[]>
  
  /** Preprocess text for optimal TTS (remove citations, etc.) */
  preprocessText(text: string): Promise<string>
}

/**
 * Speech provider factory configuration
 */
export interface SpeechProviderFactoryConfig {
  type: SpeechProviderType
  displayName: string
  description: string
  requiredSettings: (keyof SpeechProviderConfig['settings'])[]
  supportsSsml: boolean
  supportsStreaming: boolean
  supportsWordBoundary: boolean
}
