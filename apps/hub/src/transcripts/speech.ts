import type { TranscriptLine, TranscriptSession } from '@smarteverything/domain';

export type CommittedSpeech =
  | {
      readonly kind: 'transcript';
      readonly commitId: number;
      readonly session: TranscriptSession;
      readonly line: TranscriptLine;
    }
  | {
      readonly kind: 'attachment';
      readonly commitId: number;
      readonly attachmentId: string;
      readonly chatId: string | null;
      readonly profileId: string;
      readonly text: string;
      readonly bot: boolean;
    };
export interface SpeechOccurrence {
  readonly automationId: string;
  readonly revision: string;
  readonly commitId: number;
}
export function speechText(speech: CommittedSpeech): string {
  return speech.kind === 'transcript' ? speech.line.text : speech.text;
}
export function speechIsBot(speech: CommittedSpeech): boolean {
  return speech.kind === 'transcript' ? speech.line.bot : speech.bot;
}
