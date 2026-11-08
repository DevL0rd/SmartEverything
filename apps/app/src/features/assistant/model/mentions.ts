import { helperDialogueOf, type AssistantMessageRow } from '@smarteverything/domain';
import { ME_ID, helperParticipant, type Participant, type ParticipantInk } from './participant';

export interface TextToken {
  readonly kind: 'text';
  readonly text: string;
}

export interface MentionToken {
  readonly kind: 'mention';
  readonly text: string;
  readonly participantId: string;
  readonly ink: ParticipantInk;
  readonly self: boolean;
}

export type MessageToken = TextToken | MentionToken;

export interface MentionIndex {
  readonly pattern: RegExp;
  readonly byName: ReadonlyMap<string, Participant>;
}

const NAME_EDGE = '[\\p{L}\\p{N}_]';

function escaped(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mentionIndexOf(roster: readonly Participant[]): MentionIndex | null {
  if (roster.length === 0) return null;
  const byName = new Map(
    roster.map((participant) => [participant.name.toLowerCase(), participant]),
  );
  const names = [...byName.keys()].sort((left, right) => right.length - left.length);
  const pattern = new RegExp(
    `(?<!${NAME_EDGE})@(${names.map(escaped).join('|')})(?!${NAME_EDGE})`,
    'giu',
  );
  return { pattern, byName };
}

function mentionOf(text: string, participant: Participant): MentionToken {
  return {
    kind: 'mention',
    text,
    participantId: participant.id,
    ink: participant.ink,
    self: participant.id === ME_ID,
  };
}

export function tokensOf(text: string, index: MentionIndex | null): readonly MessageToken[] | null {
  if (index === null || !text.includes('@')) return null;
  const tokens: MessageToken[] = [];
  let cursor = 0;
  let found = false;
  for (const match of text.matchAll(index.pattern)) {
    const participant = index.byName.get(match[1]?.toLowerCase() ?? '');
    if (participant === undefined) continue;
    if (match.index > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, match.index) });
    tokens.push(mentionOf(match[0], participant));
    cursor = match.index + match[0].length;
    found = true;
  }
  if (!found) return null;
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  return tokens;
}

function withLeadingMention(
  tokens: readonly MessageToken[] | null,
  text: string,
  helper: Participant,
): readonly MessageToken[] {
  const first = tokens?.[0];
  if (tokens !== null && first?.kind === 'mention' && first.participantId === helper.id) {
    return tokens;
  }
  return [
    mentionOf(`@${helper.name}`, helper),
    { kind: 'text', text: ' ' },
    ...(tokens ?? [{ kind: 'text', text } as const]),
  ];
}

export function mentionsOf(
  row: Pick<AssistantMessageRow, 'text' | 'embeds'>,
  index: MentionIndex | null,
): readonly MessageToken[] | null {
  const tokens = tokensOf(row.text, index);
  const dialogue = helperDialogueOf(row);
  if (dialogue?.direction !== 'to_helper') return tokens;
  return withLeadingMention(tokens, row.text, helperParticipant(dialogue));
}
