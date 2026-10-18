import {
  audioFrameOf,
  type TalkDenial,
  type TalkEnding,
  type TalkPresence,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { CameraMicrophones } from './camera-microphone';
import type { CameraSpeakers } from './camera-speaker';
import { LiveSessions, type LiveChannel, type LiveConversation } from './live-sessions';
import type { TalkMembership } from './membership';
import { floorOf, type TalkEndpoint, type Transmission } from './transmission';
import type { Transmissions } from './transmissions';

interface Listener {
  readonly endpoint: TalkEndpoint;
  hearing: string | null;
  channels: string;
}

export interface RelayOptions {
  readonly membership: TalkMembership;
  readonly transmissions: Transmissions;
  readonly speakers: CameraSpeakers;
  readonly microphones: CameraMicrophones;
  readonly presence: (presence: TalkPresence) => void;
  readonly log: Logger;
}

function byPriority(rank: (channelId: string) => number) {
  return (left: Transmission, right: Transmission): number =>
    rank(right.channelId) - rank(left.channelId) ||
    left.startedAt.getTime() - right.startedAt.getTime();
}

type LiveRefusal = 'channel_missing' | 'channel_busy';

export type LiveOpening =
  | { readonly ok: true; readonly live: LiveChannel }
  | { readonly ok: false; readonly reason: LiveRefusal };

export class TalkRelay {
  private readonly listeners = new Map<string, Listener>();
  private readonly floors = new Map<string, Transmission>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly sizes = new Map<string, number>();
  private readonly starts = new Map<string, number>();
  private readonly live: LiveSessions;

  constructor(private readonly options: RelayOptions) {
    this.live = new LiveSessions({
      membership: options.membership,
      speakers: options.speakers,
      microphones: options.microphones,
      endpoints: (): TalkEndpoint[] =>
        [...this.listeners.values()].map((listener) => listener.endpoint),
      changed: (): void => {
        this.route();
      },
      log: options.log,
    });
  }

  openLive(channelId: string, conversation: LiveConversation): LiveOpening {
    if (this.options.membership.channel(channelId) === undefined) {
      return { ok: false, reason: 'channel_missing' };
    }
    if (this.floors.has(channelId) || this.live.has(channelId)) {
      return { ok: false, reason: 'channel_busy' };
    }
    return { ok: true, live: this.live.open(channelId, conversation) };
  }

  presence(): TalkPresence {
    return {
      floors: [...this.floors.values()].map(floorOf),
      online: [...new Set([...this.listeners.values()].map((entry) => entry.endpoint.clientId))],
    };
  }

  connect(endpoint: TalkEndpoint): void {
    const channels = this.options.membership.channelsOf(endpoint.clientId);
    this.listeners.set(endpoint.id, { endpoint, hearing: null, channels: channels.join() });
    this.options.log.info('talk.endpoint_connected', {
      endpointId: endpoint.id,
      clientId: endpoint.clientId,
      channels: channels.length,
      endpoints: this.listeners.size,
    });
    endpoint.send({ type: 'ready', clientId: endpoint.clientId, channels });
    this.live.greet(endpoint);
    this.route();
    this.announce();
  }

  disconnect(endpointId: string): void {
    this.options.log.info('talk.endpoint_disconnected', {
      endpointId,
      known: this.listeners.has(endpointId),
      endpoints: this.listeners.size,
    });
    this.endOwnedBy(endpointId, 'disconnected');
    this.listeners.delete(endpointId);
    this.live.forget(endpointId);
    this.announce();
  }

  press(endpoint: TalkEndpoint, channelId: string): void {
    const denial = this.denialFor(endpoint, channelId);
    if (denial !== null) {
      this.options.log.info('talk.press_denied', {
        endpointId: endpoint.id,
        clientId: endpoint.clientId,
        channelId,
        reason: denial,
      });
      endpoint.send({ type: 'denied', channelId, reason: denial });
      return;
    }
    this.begin(this.options.transmissions.talk(endpoint, channelId));
  }

  listen(endpoint: TalkEndpoint, channelId: string, cameraId: string): void {
    const denial =
      this.denialFor(endpoint, channelId) ??
      (this.options.membership.isMember(channelId, 'camera', cameraId)
        ? null
        : 'camera_unavailable');
    if (denial !== null) {
      this.options.log.info('talk.listen_denied', {
        endpointId: endpoint.id,
        clientId: endpoint.clientId,
        channelId,
        cameraId,
        reason: denial,
      });
      endpoint.send({ type: 'denied', channelId, reason: denial });
      return;
    }
    this.begin(
      this.options.transmissions.listen(endpoint, channelId, cameraId, {
        packet: (transmission, packet) => {
          this.forward(transmission, packet);
        },
        ended: (transmission, failure) => {
          if (failure !== null) {
            this.end(transmission, 'failed', failure);
          }
        },
      }),
    );
  }

  release(endpointId: string): void {
    this.endOwnedBy(endpointId, 'released');
    const listener = this.listeners.get(endpointId);
    if (listener !== undefined) {
      this.live.leave(listener.endpoint);
      this.route();
    }
  }

  audio(endpointId: string, packet: Uint8Array): void {
    const transmission = [...this.floors.values()].find(
      (candidate) => candidate.kind === 'talk' && candidate.owner.id === endpointId,
    );
    if (transmission !== undefined) {
      this.forward(transmission, packet);
      return;
    }
    const listener = this.listeners.get(endpointId);
    if (listener !== undefined) {
      this.live.uplink(listener.endpoint, packet);
    }
  }

  membershipChanged(): void {
    for (const transmission of [...this.floors.values()]) {
      if (this.options.membership.channel(transmission.channelId) === undefined) {
        this.end(transmission, 'channel_removed', null);
      } else if (!this.ownerStillMember(transmission)) {
        this.end(transmission, 'left', null);
      }
    }
    for (const listener of this.listeners.values()) {
      const channels = this.options.membership.channelsOf(listener.endpoint.clientId);
      if (channels.join() !== listener.channels) {
        listener.channels = channels.join();
        listener.endpoint.send({ type: 'channels', channels });
      }
    }
    this.live.membershipChanged();
    this.route();
  }

  stop(): void {
    for (const transmission of [...this.floors.values()]) {
      this.end(transmission, 'disconnected', null);
    }
    this.live.stop();
  }

  private ownerStillMember(transmission: Transmission): boolean {
    return this.options.membership.isMember(
      transmission.channelId,
      'client',
      transmission.owner.clientId,
    );
  }

  private denialFor(endpoint: TalkEndpoint, channelId: string): TalkDenial | null {
    if (!this.options.membership.isMember(channelId, 'client', endpoint.clientId)) {
      return 'not_member';
    }
    if (this.live.has(channelId)) {
      return 'live_conversation';
    }
    if ([...this.floors.values()].some((floor) => floor.owner.id === endpoint.id)) {
      return 'talking_elsewhere';
    }
    return this.floors.has(channelId) ? 'busy' : null;
  }

  private begin(transmission: Transmission): void {
    this.floors.set(transmission.channelId, transmission);
    const limitSeconds = this.options.transmissions.limitOf(transmission.kind);
    this.sizes.set(transmission.messageId, 0);
    this.starts.set(transmission.messageId, performance.now());
    this.timers.set(
      transmission.messageId,
      setTimeout(() => {
        this.end(transmission, 'time_limit', null);
      }, limitSeconds * 1000),
    );
    transmission.owner.send({
      type: 'granted',
      channelId: transmission.channelId,
      messageId: transmission.messageId,
      limitSeconds,
    });
    this.options.log.info('talk.started', {
      channelId: transmission.channelId,
      messageId: transmission.messageId,
      kind: transmission.kind,
      speaker: transmission.speaker.id,
    });
    this.route();
    this.announce();
  }

  private forward(transmission: Transmission, packet: Uint8Array): void {
    if (this.floors.get(transmission.channelId) !== transmission) {
      return;
    }
    this.sizes.set(
      transmission.messageId,
      (this.sizes.get(transmission.messageId) ?? 0) + packet.byteLength,
    );
    const frame = audioFrameOf(packet);
    for (const listener of this.listeners.values()) {
      if (listener.hearing === transmission.messageId) {
        listener.endpoint.audio(frame);
      }
    }
    transmission.sinks.forEach((sink) => {
      sink.packet(packet);
    });
  }

  private endOwnedBy(endpointId: string, reason: TalkEnding): void {
    for (const transmission of [...this.floors.values()]) {
      if (transmission.owner.id === endpointId) {
        this.end(transmission, reason, null);
      }
    }
  }

  private end(transmission: Transmission, reason: TalkEnding, detail: string | null): void {
    if (this.floors.get(transmission.channelId) !== transmission) {
      return;
    }
    this.floors.delete(transmission.channelId);
    clearTimeout(this.timers.get(transmission.messageId));
    this.timers.delete(transmission.messageId);
    const bytes = this.sizes.get(transmission.messageId) ?? 0;
    this.sizes.delete(transmission.messageId);
    const startedAt = this.starts.get(transmission.messageId);
    this.starts.delete(transmission.messageId);
    transmission.owner.send({ type: 'ended', messageId: transmission.messageId, reason, detail });
    this.options.log.info('talk.ended', {
      messageId: transmission.messageId,
      channelId: transmission.channelId,
      kind: transmission.kind,
      reason,
      detail: detail === null ? undefined : detail.slice(0, 200),
      bytes,
      durationMs: startedAt === undefined ? undefined : Math.round(performance.now() - startedAt),
    });
    this.options.transmissions.finish(transmission, bytes).catch((cause: unknown) => {
      this.options.log.error('talk.finish_failed', cause, { messageId: transmission.messageId });
    });
    this.route();
    this.announce();
  }

  private wanted(listener: Listener): Transmission | null {
    const { endpoint } = listener;
    if (this.live.engaged(endpoint)) {
      return null;
    }
    const floors = [...this.floors.values()];
    if (floors.some((floor) => floor.owner.id === endpoint.id && floor.kind === 'talk')) {
      return null;
    }
    const heard = floors
      .filter((floor) => this.audible(floor, endpoint))
      .sort(byPriority((channelId) => this.options.membership.rank(channelId)));
    return heard[0] ?? null;
  }

  private audible(floor: Transmission, endpoint: TalkEndpoint): boolean {
    const own = floor.owner.id === endpoint.id;
    if (floor.kind === 'listen' && own) {
      return true;
    }
    return !own && this.options.membership.hears(endpoint.clientId, floor.channelId);
  }

  private route(): void {
    for (const listener of this.listeners.values()) {
      const wanted = this.wanted(listener);
      const next = wanted?.messageId ?? null;
      if (next === listener.hearing) {
        continue;
      }
      if (listener.hearing !== null) {
        listener.endpoint.send({ type: 'rx_end', messageId: listener.hearing });
      }
      this.options.log.debug('talk.route_changed', {
        endpointId: listener.endpoint.id,
        clientId: listener.endpoint.clientId,
        from: listener.hearing,
        to: next,
        channelId: wanted?.channelId,
      });
      listener.hearing = next;
      if (wanted !== null) {
        listener.endpoint.send({
          type: 'rx_start',
          channelId: wanted.channelId,
          messageId: wanted.messageId,
          speaker: wanted.speaker,
        });
      }
    }
  }

  private announce(): void {
    this.options.presence(this.presence());
  }
}
