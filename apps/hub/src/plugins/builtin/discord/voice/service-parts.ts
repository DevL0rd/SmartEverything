import type { DiscordCall } from '@smarteverything/domain';
import type { PluginAssistant } from '../../contract';
import type { DiscordRest } from '../link';
import type { Person } from '../person';
import type { CallSession } from './call-session';
import type { CallPeople } from './context';
import type { Occupancy } from './occupancy';
import type { Roster } from './roster';

const NO_MENTIONS = { parse: [], replied_user: false } as const;
const MESSAGE_LIMIT = 2000;
const NAME_LIMIT = 100;

export function callPeople(roster: Roster, occupancy: Occupancy): CallPeople {
  return {
    present: (session): Person[] =>
      occupancy
        .occupants(session.guildId, session.channelId)
        .map((id) => roster.person(session.guildId, id)),
    speaker: (session, line): Person => roster.person(session.guildId, line.speaker_id ?? ''),
  };
}

export function botLine(
  session: CallSession,
  text: string,
  parts: {
    readonly assistant: PluginAssistant;
    readonly botId: string;
    readonly now: () => number;
  },
): void {
  session.addLine({
    at: new Date(parts.now()).toISOString(),
    speakerId: parts.botId,
    speaker: (parts.assistant.settings().name ?? 'Assistant').slice(0, NAME_LIMIT),
    text,
    bot: true,
  });
}

export async function typeInCall(
  rest: DiscordRest,
  session: CallSession,
  text: string,
): Promise<void> {
  await rest.post(`/channels/${session.channelId}/messages`, {
    content: text.slice(0, MESSAGE_LIMIT),
    allowed_mentions: NO_MENTIONS,
  });
}

export function viewOf(
  session: CallSession,
  parts: {
    readonly occupancy: Occupancy;
    readonly live: boolean;
    readonly muted: boolean;
  },
): DiscordCall {
  return {
    id: session.id,
    guildId: session.guildId,
    channelId: session.channelId,
    channelName: session.channelName,
    startedAt: session.startedAt,
    people: parts.occupancy.occupants(session.guildId, session.channelId).length,
    lines: session.lineCount,
    live: parts.live,
    muted: parts.muted,
  };
}
