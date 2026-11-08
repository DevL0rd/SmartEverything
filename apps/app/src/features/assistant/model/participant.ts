import {
  helperDialogueOf,
  type AiChatRow,
  type HelperDialogue,
  type MessageSource,
} from '@smarteverything/domain';
import { initialsOf } from '../../../format/text';
import { MINUTE_MS } from '../../../format/time';
import {
  isCoordinatorDialogue,
  paletteIndexOf,
  type MessageSpeaker,
  type Speakable,
} from './speaker';

const RUN_MS = 5 * MINUTE_MS;

export const ME_ID = 'me';
export const ASSISTANT_ID = 'assistant';

export type ParticipantKind =
  'me' | 'assistant' | 'helper' | 'person' | 'plugin' | 'camera' | 'schedule';

export type ParticipantInk = 'primary' | 'viz-1' | 'viz-2' | 'viz-3' | 'viz-5' | 'viz-6';

export type ParticipantGlyph = 'plugin' | 'camera' | 'schedule';

export type ParticipantAvatar =
  | { readonly kind: 'letter'; readonly letter: string }
  | { readonly kind: 'agent' }
  | { readonly kind: 'glyph'; readonly glyph: ParticipantGlyph };

export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly kind: ParticipantKind;
  readonly ink: ParticipantInk;
  readonly avatar: ParticipantAvatar;
}

export type ItemOriginKind = 'voice' | 'schedule' | 'plugin' | 'camera' | 'relayed';

export interface ItemOrigin {
  readonly kind: ItemOriginKind;
  readonly name: string | null;
  readonly pluginId: string | null;
  readonly chatId: string | null;
}

export interface RunMember {
  readonly row: { readonly kind: string; readonly created_at: string };
  readonly participant: Participant | null;
}

const VIZ_INKS = ['viz-1', 'viz-2', 'viz-3', 'viz-5', 'viz-6'] as const;

export function inkOf(name: string): ParticipantInk {
  return VIZ_INKS[paletteIndexOf(name)] ?? VIZ_INKS[0];
}

function letterAvatar(name: string): ParticipantAvatar {
  return { kind: 'letter', letter: initialsOf(name).slice(0, 1) };
}

export function assistantParticipant(name: string): Participant {
  return { id: ASSISTANT_ID, name, kind: 'assistant', ink: 'primary', avatar: { kind: 'agent' } };
}

export function helperParticipant(
  dialogue: Pick<HelperDialogue, 'helper_chat_id' | 'helper_name'>,
): Participant {
  return {
    id: `helper:${dialogue.helper_chat_id}`,
    name: dialogue.helper_name,
    kind: 'helper',
    ink: inkOf(dialogue.helper_name),
    avatar: { kind: 'agent' },
  };
}

export interface Cast {
  readonly assistant: Participant;
  readonly host: Participant;
}

export function castOf(
  assistantName: string,
  chat: Pick<AiChatRow, 'id' | 'kind' | 'helper_name'> | null,
): Cast {
  const assistant = assistantParticipant(assistantName);
  if (chat?.kind !== 'subagent' || chat.helper_name === null) return { assistant, host: assistant };
  return {
    assistant,
    host: helperParticipant({ helper_chat_id: chat.id, helper_name: chat.helper_name }),
  };
}

function glyphParticipant(kind: ParticipantGlyph, key: string, name: string): Participant {
  return {
    id: `${kind}:${key}`,
    name,
    kind,
    ink: inkOf(name),
    avatar: { kind: 'glyph', glyph: kind },
  };
}

type Sender = (row: Speakable, speaker: MessageSpeaker, cast: Cast) => Participant;

function cameraParticipant(row: Speakable, speaker: MessageSpeaker): Participant {
  const name = row.origin?.name ?? 'Camera';
  return glyphParticipant('camera', row.origin?.name ?? speaker.name, name);
}

function scheduleParticipant(_row: Speakable, speaker: MessageSpeaker): Participant {
  return glyphParticipant('schedule', speaker.name, speaker.name);
}

function pluginParticipant(row: Speakable, speaker: MessageSpeaker): Participant {
  if (row.origin?.requester !== undefined) return personParticipant(speaker.name);
  return glyphParticipant('plugin', speaker.pluginId ?? speaker.name, speaker.name);
}

function coordinatorSender(_row: Speakable, _speaker: MessageSpeaker, cast: Cast): Participant {
  return cast.assistant;
}

function helperSender(_row: Speakable, speaker: MessageSpeaker): Participant {
  return helperParticipant({
    helper_chat_id: speaker.chatId ?? speaker.name,
    helper_name: speaker.name,
  });
}

const SENDERS: Readonly<Partial<Record<MessageSource, Sender>>> = {
  wake: cameraParticipant,
  schedule: scheduleParticipant,
  plugin: pluginParticipant,
  chat: coordinatorSender,
  subagent: helperSender,
};

function senderOf(row: Speakable, speaker: MessageSpeaker, cast: Cast): Participant {
  const build = speaker.via === null ? undefined : SENDERS[speaker.via];
  return build === undefined ? personParticipant(speaker.name) : build(row, speaker, cast);
}

export function personParticipant(name: string): Participant {
  return {
    id: `person:${name}`,
    name,
    kind: 'person',
    ink: inkOf(name),
    avatar: letterAvatar(name),
  };
}

function ownParticipant(speaker: MessageSpeaker): Participant {
  return {
    id: ME_ID,
    name: speaker.name,
    kind: 'me',
    ink: inkOf(speaker.name),
    avatar: letterAvatar(speaker.name),
  };
}

export function participantOf(
  row: Speakable,
  speaker: MessageSpeaker,
  cast: Cast,
): Participant | null {
  const dialogue = helperDialogueOf(row);
  if (dialogue?.direction === 'from_helper') return helperParticipant(dialogue);
  if (isCoordinatorDialogue(row, dialogue)) return cast.assistant;
  if (speaker.kind === 'ai') return cast.host;
  if (speaker.kind === 'system') return null;
  return speaker.kind === 'me' ? ownParticipant(speaker) : senderOf(row, speaker, cast);
}

const ORIGIN_KIND: Readonly<Partial<Record<MessageSource, ItemOriginKind>>> = {
  voice: 'voice',
  schedule: 'schedule',
  plugin: 'plugin',
  wake: 'camera',
  chat: 'relayed',
  subagent: 'relayed',
};

export function originOf(row: Speakable, speaker: MessageSpeaker): ItemOrigin | null {
  const kind = speaker.via === null ? undefined : ORIGIN_KIND[speaker.via];
  if (kind === undefined || helperDialogueOf(row) !== undefined) return null;
  return {
    kind,
    name: row.origin?.name ?? null,
    pluginId: speaker.pluginId,
    chatId: speaker.chatId,
  };
}

export function rosterOf(
  members: readonly { readonly row: Speakable; readonly participant: Participant | null }[],
): readonly Participant[] {
  const roster = new Map<string, Participant>();
  for (const { row, participant } of members) {
    if (participant !== null && !roster.has(participant.id))
      roster.set(participant.id, participant);
    const dialogue = helperDialogueOf(row);
    if (dialogue === undefined) continue;
    const helper = helperParticipant(dialogue);
    if (!roster.has(helper.id)) roster.set(helper.id, helper);
  }
  return [...roster.values()];
}

export function isGroup(roster: readonly Participant[]): boolean {
  return roster.filter((participant) => participant.kind !== 'me').length >= 2;
}

export function continuesRun(previous: RunMember | undefined, member: RunMember): boolean {
  if (previous === undefined) return false;
  if (previous.row.kind === 'call' || member.row.kind === 'call') return false;
  const before = previous.participant;
  const now = member.participant;
  if (before === null || before.id !== now?.id) return false;
  return Date.parse(member.row.created_at) - Date.parse(previous.row.created_at) <= RUN_MS;
}
