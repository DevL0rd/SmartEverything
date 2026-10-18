import type { Logger } from '@smarteverything/logging';
import type { Ledger } from '../ledger/ledger';
import { recordAudioTranscription } from '../ledger/transcription';
import type { TranscriptionAnswer, TranscriptionProvider } from '../openrouter/transcription';
import { speechOf } from './heard-text';
import { wavOf } from './wav';

export function transcribeModel(): string {
  return 'openai/whisper-large-v3-turbo';
}

export interface TranscribeRequest {
  readonly pcm16k: Int16Array;
  readonly profileId: string;
  readonly pluginId: string | null;
  readonly names: readonly string[];
  readonly recent: readonly string[];
  readonly language?: string;
  readonly meta: Readonly<Record<string, string>>;
}

export interface TranscriberOptions {
  readonly provider: TranscriptionProvider;
  readonly ledger: Ledger;
  readonly log: Logger;
}

function hintsOf(request: TranscribeRequest): string {
  return [...request.names, ...request.recent].join('\n');
}

export class Transcriber {
  private readonly model = transcribeModel();

  constructor(private readonly options: TranscriberOptions) {}

  async transcribe(request: TranscribeRequest): Promise<string | null> {
    if (request.pcm16k.every((sample) => sample === 0)) return null;
    const answer = await this.options.provider.transcribe({
      model: this.model,
      hints: hintsOf(request),
      data: wavOf(request.pcm16k),
      format: 'wav',
      ...(request.language === undefined || request.language === ''
        ? {}
        : { language: request.language }),
    });
    this.record(request, answer);
    return speechOf(answer.text);
  }

  private record(request: TranscribeRequest, answer: TranscriptionAnswer): void {
    try {
      recordAudioTranscription(this.options.ledger, {
        profileId: request.profileId,
        messageId: null,
        pluginId: request.pluginId,
        model: this.model,
        answer,
        audioMs: Math.round(request.pcm16k.length / 16),
        meta: request.meta,
      });
    } catch (cause) {
      this.options.log.error('transcripts.usage_unrecorded', cause, { pluginId: request.pluginId });
    }
  }
}
