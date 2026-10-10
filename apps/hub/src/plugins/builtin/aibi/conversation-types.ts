import type { ToolScheduling } from '../../../assistant-voice/gemini';
import type { TurnEvents, TurnTool } from '../../../assistant-voice/turn-session';
import type { PluginVoice } from '../../plugin-voice';
import type { BodyOutcome } from './turn';

export type VoiceTurn = Awaited<ReturnType<PluginVoice['turn']>>;

export interface DeskAnswer {
  readonly outcome?: BodyOutcome;
  readonly end?: boolean;
  readonly spoken?: boolean;
  readonly holds?: boolean;
  readonly result: Readonly<Record<string, unknown>>;
  readonly line?: string;
}

export interface DeskTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: TurnTool['parameters'];
  readonly delivery: ToolScheduling;
  readonly answer: (args: Readonly<Record<string, string>>) => DeskAnswer | Promise<DeskAnswer>;
}

export interface ConversationHooks {
  readonly settings: () => { readonly idleSeconds: number; readonly speechThreshold: number };
  readonly open: (request: {
    readonly tools: readonly TurnTool[];
    readonly events: TurnEvents;
  }) => Promise<VoiceTurn>;
  readonly tools: () => readonly DeskTool[];
  readonly heard: (text: string) => void;
  readonly said: (text: string) => void;
  readonly warn: (title: string, detail: string) => void;
  readonly working: () => boolean;
  readonly ended: (conversation: EndedConversation, untold: string[]) => void;
}

interface EndedConversation {
  readonly active: boolean;
}
