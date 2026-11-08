import {
  assistantLabel,
  helperDialogueOf,
  messageSpeaker,
  type AssistantMessageRow,
  type HelperDialogue,
  type MessageSource,
  type MessageSpeaker,
} from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';

export type { MessageSpeaker } from '@smarteverything/domain';

const DEFAULT_ASSISTANT_NAME = assistantLabel({ name: null });

export const TIME_GAP_MS = 60 * MINUTE_MS;

export type PluginNames = ReadonlyMap<string, string>;

export type RunPosition = 'only' | 'first' | 'middle' | 'last';

export type Speakable = Pick<AssistantMessageRow, 'role' | 'author' | 'origin' | 'embeds'>;

export function isCoordinatorDialogue(
  row: Speakable,
  dialogue: HelperDialogue | undefined,
): boolean {
  const source = row.origin?.source;
  return dialogue?.direction === 'to_helper' && (source === 'chat' || source === 'subagent');
}

export function isAssistantParticipant(row: Speakable): boolean {
  if (row.role === 'responder') return true;
  const dialogue = helperDialogueOf(row);
  return dialogue?.direction === 'from_helper' || isCoordinatorDialogue(row, dialogue);
}

export function isAssistantReply(row: Speakable): boolean {
  const dialogue = helperDialogueOf(row);
  return dialogue === undefined ? row.role === 'responder' : dialogue.direction === 'from_helper';
}

export function speakerOf(row: Speakable, assistant = DEFAULT_ASSISTANT_NAME): MessageSpeaker {
  const speaker = messageSpeaker(row);
  const dialogue = helperDialogueOf(row);
  if (dialogue?.direction === 'from_helper') {
    return { ...speaker, kind: 'person', name: dialogue.helper_name };
  }
  return isCoordinatorDialogue(row, dialogue)
    ? { ...speaker, name: assistant, via: null }
    : speaker;
}

export function positionOf(continuesBefore: boolean, continuesAfter: boolean): RunPosition {
  if (continuesBefore) {
    return continuesAfter ? 'middle' : 'last';
  }
  return continuesAfter ? 'first' : 'only';
}

const SOURCE_LABEL: Readonly<Partial<Record<MessageSource, string>>> = {
  voice: 'By voice',
  schedule: 'Scheduled',
  subagent: 'Sub-agent',
  chat: 'Another chat',
  hub: 'SmartEverything',
};

export function sourceLabelOf(row: Speakable, plugins: PluginNames): string | null {
  const { origin } = row;
  const dialogue = helperDialogueOf(row);
  if (
    origin === null ||
    dialogue?.direction === 'from_helper' ||
    isCoordinatorDialogue(row, dialogue)
  ) {
    return null;
  }
  if (origin.source === 'plugin') return pluginLabel(origin.plugin_id, plugins);
  if (origin.source === 'wake') {
    return origin.name ?? 'Camera';
  }
  return SOURCE_LABEL[origin.source] ?? null;
}

function pluginLabel(id: string | null, plugins: PluginNames): string {
  return id === null ? 'Plugin' : (plugins.get(id) ?? id);
}

const VIA_LABEL: Readonly<Partial<Record<MessageSource, string>>> = {
  app: 'From the app',
  voice: 'By voice',
};

export function viaLabelOf(row: Speakable): string | null {
  return row.origin === null ? null : (VIA_LABEL[row.origin.source] ?? null);
}

const PALETTE_SLOTS = [1, 2, 3, 5, 6] as const;

export function paletteIndexOf(name: string): number {
  let hash = 0;
  for (const letter of name) {
    hash = (hash * 31 + (letter.codePointAt(0) ?? 0)) % 9973;
  }
  return hash % PALETTE_SLOTS.length;
}

export function paletteSlotOf(name: string): number {
  return PALETTE_SLOTS[paletteIndexOf(name)] ?? PALETTE_SLOTS[0];
}
