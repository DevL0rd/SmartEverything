import type { WakeSensitivity } from '@smarteverything/domain';
import { systemClock } from '../../../../clock';
import type { PluginVoice } from '../../../plugin-voice';
import type { PluginAssistant } from '../../contract';
import type { Identity } from '../identity';
import type { Policy } from '../policy';
import type { DiscordSettings } from '../settings';
import { CallSession, type SessionHooks } from './call-session';
import { CALL_TITLE_PREFIX, callKey } from './calls';
import type { LiveVoices } from './live';
import type { VoiceLink } from './link';
import type { Occupancy } from './occupancy';
import type { Roster } from './roster';

const TITLE_LIMIT = 200;

export interface FactoryDeps {
  readonly settings: DiscordSettings;
  readonly voice: PluginVoice;
  readonly policy: Policy;
  readonly roster: Roster;
  readonly occupancy: Occupancy;
  readonly identity: Identity;
  readonly assistant: PluginAssistant;
  readonly now: () => number;
  readonly report: (cause: unknown) => void;
  readonly changed: () => void;
  readonly live: LiveVoices;
}

export interface Resumed {
  readonly transcript: ReturnType<PluginVoice['transcript']>;
  readonly startedAt: string;
  readonly lines: number;
}

function namesIn(deps: FactoryDeps, session: CallSession): string[] {
  const { policy, roster, occupancy } = deps;
  return [
    ...policy.names(),
    ...roster.names(session.guildId, occupancy.occupants(session.guildId, session.channelId)),
  ];
}

function hooksOf(deps: FactoryDeps, guildId: string, session: () => CallSession): SessionHooks {
  const { policy, roster, settings, identity, live } = deps;
  return {
    approved: (userId): boolean => policy.userAllowed(userId),
    captures: (userId): boolean =>
      userId !== identity.botId &&
      (settings.voice_transcribe === 'everyone' || policy.userAllowed(userId)),
    mixes: (userId, pcm): void => {
      live.mixes(session(), userId, pcm);
    },
    wakeable: (userId): boolean => live.wakeable(session(), userId),
    wakeSensitivity: (): WakeSensitivity => settings.voice_wake_sensitivity,
    wakeNames: (): string[] => policy.names(),
    wake: (userId, phrase, words, onSuperseded): void => {
      live.wake(session(), roster.person(guildId, userId), { phrase, words, onSuperseded });
    },
    heard: (line): void => {
      live.heard(session(), line);
    },
    speaker: (userId) => roster.known(guildId, userId),
    names: (): string[] => namesIn(deps, session()),
    report: deps.report,
    changed: (): void => {
      deps.changed();
    },
  };
}

export function buildSession(
  deps: FactoryDeps,
  link: VoiceLink,
  where: { readonly guildId: string; readonly channelName: string | null },
  resumed?: Resumed,
): CallSession {
  const { guildId, channelName } = where;
  const startedAt = resumed?.startedAt ?? new Date(deps.now()).toISOString();
  const transcript =
    resumed?.transcript ??
    deps.voice.transcript({
      key: callKey(guildId, link.channelId, deps.now()),
      title: `${CALL_TITLE_PREFIX}${channelName ?? link.channelId}`.slice(0, TITLE_LIMIT),
      retentionDays: deps.settings.voice_retention_days,
    });
  const session: CallSession = new CallSession({
    identity: { guildId, channelId: link.channelId, channelName, startedAt },
    link,
    transcript,
    voice: deps.voice,
    language: deps.settings.voice_language,
    clock: systemClock,
    ...(resumed === undefined ? {} : { lines: resumed.lines }),
    hooks: hooksOf(deps, guildId, () => session),
  });
  return session;
}
