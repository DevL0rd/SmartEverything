import type { DiscordCall, DiscordStatus } from '@smarteverything/domain';
import type { PluginVoice } from '../../../plugin-voice';
import type { PluginAssistant } from '../../contract';
import type { Channels } from '../channels';
import type { RawChannel } from '../payloads';
import { DiscordInputError } from '../errors';
import type { Identity } from '../identity';
import type { DiscordRest } from '../link';
import { displayName, type Person } from '../person';
import type { Policy } from '../policy';
import type { DiscordSettings } from '../settings';
import type { CallSession } from './call-session';
import { NOT_VOICE } from './calls';
import { placeText, type CallPeople, type CallText } from './context';
import { LiveVoices } from './live';
import type { VoiceConnect, VoiceGateway } from './link';
import type { Occupancy, Moved } from './occupancy';
import { Presence } from './presence';
import { buildSession, type FactoryDeps, type Resumed } from './session-factory';
import { botLine, callPeople, typeInCall, viewOf } from './service-parts';
import type { Roster } from './roster';
import type { TypedRequests } from './typed';

const VOICE_CHANNEL_TYPES: ReadonlySet<number> = new Set([2, 13]);

export interface VoiceServiceDeps {
  readonly settings: DiscordSettings;
  readonly voice: PluginVoice;
  readonly policy: Policy;
  readonly channels: Channels;
  readonly roster: Roster;
  readonly occupancy: Occupancy;
  readonly connect: VoiceConnect;
  readonly issue: () => string | null;
  readonly gateway: VoiceGateway;
  readonly identity: Identity;
  readonly assistant: PluginAssistant;
  readonly rest: DiscordRest;
  readonly connected: () => boolean;
  readonly texts: CallText;
  readonly typed: TypedRequests;
  readonly owner: () => Person | null;
  readonly publish: (calls: DiscordStatus['calls']) => void;
  readonly now: () => number;
  readonly report: (cause: unknown) => void;
}

export class VoiceService {
  private readonly sessions = new Map<string, CallSession>();
  private readonly joining = new Set<string>();
  private readonly muted = new Set<string>();
  private readonly presence: Presence;
  private readonly live: LiveVoices;
  private readonly people: CallPeople;
  private readonly factory: FactoryDeps;
  private readonly unwatchKey: () => void;

  constructor(private readonly deps: VoiceServiceDeps) {
    const { roster, occupancy } = deps;
    this.people = callPeople(roster, occupancy);
    this.live = new LiveVoices({
      voice: deps.voice,
      settings: deps.settings,
      policy: deps.policy,
      place: (session): string => this.place(session),
      muted: (session): boolean => this.mutedIn(session),
      typed: (session, person, text): void => {
        deps.typed.request(session, person, text);
      },
      typeInCall: (session, text): Promise<void> => typeInCall(deps.rest, session, text),
      botLine: (session, text): void => {
        botLine(session, text, {
          assistant: deps.assistant,
          botId: deps.identity.botId,
          now: deps.now,
        });
      },
      changed: (): void => {
        this.announce();
      },
      now: deps.now,
      report: deps.report,
    });
    this.factory = {
      ...deps,
      live: this.live,
      changed: (): void => {
        this.announce();
      },
    };
    this.unwatchKey = deps.voice.keyChanges(() => {
      this.endLive().catch(deps.report);
    });
    this.presence = new Presence({
      seconds: deps.settings.voice_leave_after_seconds,
      approvedHere: (session): boolean =>
        occupancy
          .occupants(session.guildId, session.channelId)
          .some((userId) => deps.policy.userAllowed(userId)),
      leave: (guildId): void => {
        this.leave(guildId).catch(deps.report);
      },
    });
  }

  available(): string | null {
    const { settings, voice } = this.deps;
    if (!settings.voice_enabled) {
      return 'Voice is turned off in settings';
    }
    if (!this.deps.connected()) {
      return 'Discord is not connected yet';
    }
    const issue = this.deps.issue();
    if (issue !== null) {
      return issue;
    }
    if (!voice.ready()) {
      return 'Add a Google Gemini API key in the voice settings to use voice';
    }
    return null;
  }

  session(guildId: string): CallSession | undefined {
    return this.sessions.get(guildId);
  }

  channelOf(guildId: string, userId: string): string | null {
    return this.deps.occupancy.channelOf(guildId, userId);
  }

  async join(guildId: string, channelId: string): Promise<CallSession> {
    const blocked = this.available();
    if (blocked !== null) {
      throw new DiscordInputError(blocked);
    }
    const { policy } = this.deps;
    policy.assertGuild(guildId);
    policy.assertChannel(channelId);
    const channel = await this.voiceChannel(guildId, channelId);
    const current = this.sessions.get(guildId);
    if (current?.channelId === channelId) {
      return current;
    }
    if (current !== undefined || this.joining.has(guildId)) {
      throw new DiscordInputError('The bot is already in a call in this server');
    }
    this.joining.add(guildId);
    try {
      return await this.open(guildId, channel);
    } finally {
      this.joining.delete(guildId);
    }
  }

  async leave(guildId: string): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return false;
    }
    this.sessions.delete(guildId);
    this.presence.clear(guildId);
    await this.live.end(guildId);
    await session.close();
    this.announce();
    return true;
  }

  async stateChanged(moved: Moved): Promise<void> {
    const { guildId, userId, before, after } = moved;
    const session = this.sessions.get(guildId);
    if (userId === this.deps.identity.botId) {
      if (session !== undefined && after !== session.channelId) {
        await this.leave(guildId);
      }
      return;
    }
    if (session !== undefined) {
      this.moved(session, moved);
      return;
    }
    if (after !== null && after !== before) {
      await this.arrived(guildId, userId, after);
    }
  }

  async guildLoaded(guildId: string): Promise<void> {
    for (const seat of this.deps.occupancy.seatsIn(guildId)) {
      await this.arrived(seat.guildId, seat.userId, seat.channelId);
    }
  }

  mute(guildId: string, muted: boolean): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      throw new DiscordInputError('The bot is not in a voice call in this server');
    }
    session.link.setMuted(muted);
    if (muted) {
      this.muted.add(guildId);
      this.live.end(guildId).catch(this.deps.report);
    } else {
      this.muted.delete(guildId);
    }
    this.announce();
  }

  target(guildId?: string, userId?: string): CallSession {
    if (guildId !== undefined) {
      return this.inGuild(guildId);
    }
    if (userId !== undefined) {
      return this.ofPerson(userId);
    }
    const all = [...this.sessions.values()];
    const [only] = all;
    if (all.length === 1 && only !== undefined) {
      return only;
    }
    throw new DiscordInputError(
      all.length > 0
        ? 'The bot is in several calls; pass guildId or userId'
        : 'The bot is not in a call',
    );
  }

  async speak(
    text: string,
    guildId?: string,
    userId?: string,
  ): Promise<{ readonly callId: string; readonly channelId: string; readonly spoken: boolean }> {
    const session = this.target(guildId, userId);
    this.deps.policy.assertGuild(session.guildId);
    this.deps.policy.assertChannel(session.channelId);
    const speaker = userId ?? this.deps.owner()?.id ?? this.deps.identity.botId;
    const spoken = await this.live.say(session, speaker, text);
    return { callId: session.id, channelId: session.channelId, spoken };
  }

  contextFor(guildId: string | null, actorId: string): string {
    const session =
      guildId === null
        ? [...this.sessions.values()].find(
            (item) => this.channelOf(item.guildId, actorId) === item.channelId,
          )
        : this.sessions.get(guildId);
    return session === undefined ? '' : this.deps.texts.textFor(session);
  }

  views(): DiscordCall[] {
    return [...this.sessions.values()].map((session) =>
      viewOf(session, {
        occupancy: this.deps.occupancy,
        live: this.live.active(session.guildId),
        muted: this.mutedIn(session),
      }),
    );
  }

  private async endLive(): Promise<void> {
    for (const guildId of [...this.sessions.keys()]) {
      await this.live.end(guildId);
    }
  }

  announce(): void {
    this.deps.publish(this.views());
  }

  async stop(): Promise<void> {
    this.unwatchKey();
    for (const guildId of [...this.sessions.keys()]) {
      await this.leave(guildId);
    }
  }

  private async voiceChannel(guildId: string, channelId: string): Promise<RawChannel> {
    const channel = await this.deps.channels.resolve(channelId);
    if (channel.guild_id !== guildId || !VOICE_CHANNEL_TYPES.has(channel.type)) {
      throw new DiscordInputError(NOT_VOICE);
    }
    return channel;
  }

  private async open(
    guildId: string,
    channel: RawChannel,
    resumed?: Resumed,
  ): Promise<CallSession> {
    const { roster, occupancy } = this.deps;
    const channelId = channel.id;
    const link = await this.deps.connect({
      guildId,
      channelId,
      muted: this.muted.has(guildId),
      gateway: this.deps.gateway,
    });
    const session = buildSession(
      this.factory,
      link,
      { guildId, channelName: channel.name ?? null },
      resumed,
    );
    this.sessions.set(guildId, session);
    link.onClosed((reason, cause) => {
      if (cause !== null) {
        this.deps.report(cause);
      }
      this.closed(session, reason).catch(this.deps.report);
    });
    session.start();
    for (const id of occupancy.occupants(guildId, channelId)) {
      roster.known(guildId, id).catch(this.deps.report);
    }
    this.presence.check(session);
    this.announce();
    return session;
  }

  private moved(session: CallSession, moved: Moved): void {
    const { guildId, userId, after } = moved;
    if (after !== session.channelId) {
      session.dropEar(userId);
    } else {
      this.deps.roster.known(guildId, userId).catch(this.deps.report);
    }
    this.presence.check(session);
    this.announce();
  }

  private async arrived(guildId: string, userId: string, channelId: string): Promise<void> {
    const { settings, policy, identity } = this.deps;
    if (
      !settings.voice_auto_join ||
      this.available() !== null ||
      this.sessions.has(guildId) ||
      this.joining.has(guildId) ||
      userId === identity.botId
    ) {
      return;
    }
    if (!policy.userAllowed(userId) || !policy.guildAllowed(guildId)) {
      return;
    }
    if (!policy.channelAllowed(channelId)) {
      return;
    }
    await this.join(guildId, channelId).catch(this.deps.report);
  }

  private async closed(session: CallSession, reason: 'closed' | 'decrypt'): Promise<void> {
    if (this.sessions.get(session.guildId) !== session) {
      return;
    }
    if (reason === 'decrypt' && this.available() === null) {
      await this.rejoin(session);
      return;
    }
    await this.leave(session.guildId);
  }

  private async rejoin(session: CallSession): Promise<void> {
    const { guildId, channelId } = session;
    this.sessions.delete(guildId);
    this.presence.clear(guildId);
    await this.live.end(guildId);
    await session.close(true);
    this.joining.add(guildId);
    try {
      await this.open(guildId, await this.voiceChannel(guildId, channelId), {
        transcript: session.transcript,
        startedAt: session.startedAt,
        lines: session.lineCount,
      });
    } catch (cause) {
      this.deps.report(cause);
      session.transcript.close();
      this.announce();
    } finally {
      this.joining.delete(guildId);
    }
  }

  private inGuild(guildId: string): CallSession {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      throw new DiscordInputError('The bot is not in a call in that server');
    }
    return session;
  }

  private ofPerson(userId: string): CallSession {
    const session = [...this.sessions.values()].find(
      (item) => this.channelOf(item.guildId, userId) === item.channelId,
    );
    if (session === undefined) {
      throw new DiscordInputError('That person is not in a call with the bot');
    }
    return session;
  }

  private mutedIn(session: CallSession): boolean {
    return session.link.muted() || this.deps.occupancy.serverMuted(session.guildId);
  }

  private place(session: CallSession): string {
    const owner = this.deps.owner();
    return placeText(
      session,
      this.people,
      owner === null ? null : `The owner is ${displayName(owner)} (ID ${owner.id}).`,
      this.deps.settings.voice_context_minutes,
    );
  }
}
