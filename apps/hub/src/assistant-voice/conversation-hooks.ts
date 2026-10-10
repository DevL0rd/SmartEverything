import type { FunctionDeclaration, UsageMetadata } from '@google/genai';
import type { AssistantVoiceSettings, CallEnding } from '@smarteverything/domain';
import type { RecordedTurn } from './call-record';
import type { LiveWindow } from './gemini';
import type { SpeechSource } from './speech-input';
import type { ToolAnswer } from './tool-answer';

export interface ConversationHooks {
  readonly speech: SpeechSource;
  readonly settings: () => AssistantVoiceSettings;
  readonly system: () => string;
  readonly tools: () => readonly FunctionDeclaration[];
  readonly window: () => LiveWindow | null;
  readonly record: (turn: RecordedTurn) => void;
  readonly task: (task: string, said: string | null) => string;
  readonly run: (
    name: string,
    args: Readonly<Record<string, unknown>>,
    heardSince: (at: number) => string,
  ) => Promise<ToolAnswer>;
  readonly ended: (reason: CallEnding, detail: string | null) => void;
  readonly usage: (usage: UsageMetadata, model: string) => void;
  readonly stalled: (step: 'nudged' | 'gave_up') => void;
}
