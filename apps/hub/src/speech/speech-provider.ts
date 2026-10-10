export interface SpeechOptions {
  readonly model: string;
  readonly voice: string;
  readonly text: string;
  readonly signal: AbortSignal;
}

export interface SpeechUsage {
  readonly inputTokens: number;
  readonly audioTokens: number;
}

export type SpeechChunk =
  | { readonly kind: 'audio'; readonly pcm: Int16Array }
  | { readonly kind: 'usage'; readonly usage: SpeechUsage };

export interface SpeechProvider {
  readonly synthesize: (options: SpeechOptions) => AsyncIterable<SpeechChunk>;
}
