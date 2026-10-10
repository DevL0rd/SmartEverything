import type { AssistantSettings, TalkChannelRow, TalkMessageRow } from '@smarteverything/domain';
import { historyCharacters, liveMinutes, newest } from '../assistant-voice/live-window';

const MINUTE_MS = 60_000;

export interface TalkWakeInput {
  readonly channel: TalkChannelRow;
  readonly speaker: string;
  readonly phrase: string;
  readonly transcript: string | null;
  readonly context: readonly string[];
}

export function talkLine(row: TalkMessageRow, timeZone: string): string {
  const at = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(row.started_at));
  return `${at} ${row.speaker_label}: ${row.transcript ?? ''}`;
}

export function talkContext(
  rows: readonly TalkMessageRow[],
  settings: AssistantSettings,
  timeZone: string,
  now: Date,
): string[] {
  const since = new Date(now.getTime() - liveMinutes(settings) * MINUTE_MS).toISOString();
  const lines = rows
    .filter((row) => row.transcript !== null && row.started_at >= since)
    .map((row) => talkLine(row, timeZone));
  return newest(lines, historyCharacters(settings));
}

export function talkWakeText(input: TalkWakeInput): string {
  const said =
    input.transcript === null
      ? `${input.speaker} said “${input.phrase}” on the walkie-talkie channel “${input.channel.name}”; there is no transcript of it.`
      : `${input.speaker} said “${input.phrase}” on the walkie-talkie channel “${input.channel.name}”, in full: “${input.transcript}”`;
  const earlier = input.context.length === 0 ? [] : ['Earlier on this channel:', ...input.context];
  return [said, ...earlier, 'Your reply is spoken on this channel.'].join('\n');
}
