export interface SpeechSegment {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly pcm: Int16Array;
}
