import type { FunctionDeclaration, UsageMetadata } from '@google/genai';
import type { AssistantVoiceSettings, CallEnding } from '@smarteverything/domain';
import type { RecordedTurn } from './call-record';
import type { LiveWindow } from './gemini';
import type { HostedListening } from './outreach';
import type { SpeechSource } from './speech-input';
import type { ToolAnswer } from './tool-answer';
import type { Measure } from './turn-timing';

export interface ConversationHooks {
  readonly speech: SpeechSource;
  readonly listening?: HostedListening;
  readonly settings: () => AssistantVoiceSettings;
  readonly system: () => string;
  readonly tools: () => readonly FunctionDeclaration[];
  readonly window: () => LiveWindow | null;
  readonly record: (turn: RecordedTurn) => void;
  readonly task: (task: string, said: string | null) => string;
  readonly run: (name: string, args: Readonly<Record<string, unknown>>) => Promise<ToolAnswer>;
  readonly ended: (reason: CallEnding, detail: string | null) => void;
  readonly usage: (usage: UsageMetadata, model: string) => void;
  readonly measured: Measure;
  readonly stalled: (step: 'nudged' | 'gave_up') => void;
  readonly detached?: () => boolean;
  readonly staysOpenWhenQuiet: () => boolean;
}
