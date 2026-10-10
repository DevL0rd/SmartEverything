import {
  messageSpeaker,
  type AssistantMessageRow,
  type MessageSource,
  type MessageSpeaker,
} from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';

export type { MessageSpeaker } from '@smarteverything/domain';

const RUN_MS = 5 * MINUTE_MS;

export const TIME_GAP_MS = 60 * MINUTE_MS;

export type PluginNames = ReadonlyMap<string, string>;

export type RunPosition = 'only' | 'first' | 'middle' | 'last';

type Speakable = Pick<AssistantMessageRow, 'role' | 'author' | 'origin'>;

export function speakerOf(row: Speakable): MessageSpeaker {
  return messageSpeaker(row);
}

function sameVoice(left: MessageSpeaker, right: MessageSpeaker): boolean {
  if (left.kind !== right.kind || left.kind === 'system') {
    return false;
  }
  return left.kind === 'person' ? left.name === right.name : true;
}

export function continuesRun(
  previous: AssistantMessageRow | undefined,
  row: AssistantMessageRow,
): boolean {
  if (previous === undefined || previous.kind === 'call' || row.kind === 'call') {
    return false;
  }
  const near = Date.parse(row.created_at) - Date.parse(previous.created_at) <= RUN_MS;
  return near && sameVoice(speakerOf(previous), speakerOf(row));
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
};

export function sourceLabelOf(row: Speakable, plugins: PluginNames): string | null {
  const { origin } = row;
  if (origin === null) {
    return null;
  }
  if (origin.source === 'plugin') {
    const named = origin.plugin_id === null ? undefined : plugins.get(origin.plugin_id);
    return named ?? origin.plugin_id ?? 'Plugin';
  }
  if (origin.source === 'wake') {
    return origin.name ?? 'Camera';
  }
  return SOURCE_LABEL[origin.source] ?? null;
}

export function viaLabelOf(row: Speakable): string | null {
  switch (row.origin?.source) {
    case 'app':
      return 'From the app';
    case 'voice':
      return 'By voice';
    case 'plugin':
    case 'wake':
    case 'schedule':
    case 'subagent':
    case 'chat':
    case undefined:
      return null;
  }
}

const PALETTE_SIZE = 6;

export function paletteSlotOf(name: string): number {
  let hash = 0;
  for (const letter of name) {
    hash = (hash * 31 + (letter.codePointAt(0) ?? 0)) % 9973;
  }
  return (hash % PALETTE_SIZE) + 1;
}
