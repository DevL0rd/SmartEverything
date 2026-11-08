import {
  CALL_TRANSCRIPT_EMBED,
  type AssistantMessageRow,
  type CallTurn,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';
import { playTime } from '../../../format/time';

const TOOL_PREFIX = '· ';
const LEGACY_PERSON = 'Me';
const LEAD_LINES = 2;

type Speaker = CallTurn['who'];

interface Labels {
  readonly person: readonly string[];
  readonly assistant: readonly string[];
}

export type CallLineTone = 'variant' | 'faint' | 'critical';

export interface CallLine {
  readonly speaker: string | null;
  readonly text: string;
  readonly tone: CallLineTone;
}

export interface CallView {
  readonly length: string;
  readonly lead: readonly CallLine[];
  readonly rest: readonly CallLine[];
  readonly failures: number;
}

function labelsOf(row: AssistantMessageRow): Labels {
  const person = row.origin?.name ?? null;
  return {
    person: person === null ? [LEGACY_PERSON] : [person, LEGACY_PERSON],
    assistant: [row.author],
  };
}

function prefixed(line: string, names: readonly string[]): string | null {
  const name = names.find((candidate) => line.startsWith(`${candidate}: `));
  return name === undefined ? null : line.slice(name.length + 2);
}

function lineTurn(line: string, labels: Labels): CallTurn | null {
  const said: readonly (readonly [Speaker, string | null])[] = [
    ['tool', line.startsWith(TOOL_PREFIX) ? line.slice(TOOL_PREFIX.length) : null],
    ['person', prefixed(line, labels.person)],
    ['assistant', prefixed(line, labels.assistant)],
  ];
  for (const [who, text] of said) {
    if (text !== null) {
      return { who, text, ok: true, detail: null };
    }
  }
  return null;
}

function legacyTurns(row: AssistantMessageRow): readonly CallTurn[] {
  const labels = labelsOf(row);
  return row.text.split('\n').reduce<CallTurn[]>((turns, line) => {
    if (line.trim() === '') {
      return turns;
    }
    const turn = lineTurn(line, labels);
    const last = turns.at(-1);
    if (turn !== null) {
      return [...turns, turn];
    }
    if (last === undefined || last.who === 'tool') {
      return [...turns, { who: 'assistant', text: line, ok: true, detail: null }];
    }
    return [...turns.slice(0, -1), { ...last, text: `${last.text}\n${line}` }];
  }, []);
}

export function callTurnsOf(row: AssistantMessageRow): readonly CallTurn[] {
  for (const embed of row.embeds) {
    const parsed = CALL_TRANSCRIPT_EMBED.safeParse(embed);
    if (parsed.success) {
      return parsed.data.turns;
    }
  }
  return legacyTurns(row);
}

function callLengthOf(row: AssistantMessageRow): string {
  const seconds = Math.max(
    1,
    Math.round((Date.parse(row.updated_at) - Date.parse(row.created_at)) / 1000),
  );
  return playTime(seconds);
}

export function callTitleOf(row: AssistantMessageRow): string {
  return `Call · ${callLengthOf(row)}`;
}

export function callPreviewOf(row: AssistantMessageRow): string {
  const spoken = callTurnsOf(row).findLast(
    (turn) => turn.who !== 'tool' && turn.text.trim() !== '',
  );
  return spoken === undefined ? callTitleOf(row) : spoken.text.replace(/\s+/g, ' ').trim();
}

export function callFailuresOf(turns: readonly CallTurn[]): number {
  return turns.filter((turn) => turn.who === 'tool' && !turn.ok).length;
}

function callLineOf(turn: CallTurn, row: AssistantMessageRow): CallLine {
  switch (turn.who) {
    case 'tool':
      return turn.ok
        ? { speaker: null, text: turn.text, tone: 'faint' }
        : {
            speaker: null,
            text: turn.detail === null ? turn.text : `${turn.text}: ${turn.detail}`,
            tone: 'critical',
          };
    case 'person':
      return { speaker: row.origin?.name ?? 'You', text: turn.text, tone: 'variant' };
    case 'assistant':
      return { speaker: row.author, text: turn.text, tone: 'variant' };
  }
}

export function callViewOf(row: AssistantMessageRow): CallView {
  const turns = callTurnsOf(row);
  const lines = turns.map((turn) => callLineOf(turn, row));
  return {
    length: callLengthOf(row),
    lead: lines.slice(0, LEAD_LINES),
    rest: lines.slice(LEAD_LINES),
    failures: callFailuresOf(turns),
  };
}

export function moreLinesOf(count: number): string {
  return plural(count, 'more line', 'more lines');
}

export function failedActionsOf(count: number): string {
  return plural(count, 'action failed', 'actions failed');
}
