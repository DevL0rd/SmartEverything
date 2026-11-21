import { randomUUID } from 'node:crypto';
import {
  LISTEN_SECONDS_MAX,
  TALK_SECONDS_MAX,
  type TalkMemberKind,
  type TalkMessageKind,
  type TalkSpeaker,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { CameraMicrophones } from './camera-microphone';
import type { CameraSpeakers } from './camera-speaker';
import type { TalkMembership } from './membership';
import type { Recording, TalkRecorder } from './recorder';
import type { TalkListening } from './talk-listening';
import type { PacketSink, TalkEndpoint, Transmission } from './transmission';
import { background, messageOf } from '@smarteverything/logging';

export interface TransmissionsOptions {
  readonly store: Pick<Store, 'host'>;
  readonly membership: TalkMembership;
  readonly recorder: TalkRecorder;
  readonly speakers: CameraSpeakers;
  readonly microphones: CameraMicrophones;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface CameraFeed {
  readonly packet: (transmission: Transmission, packet: Uint8Array) => void;
  readonly ended: (transmission: Transmission, failure: string | null) => void;
}

interface Opening {
  readonly owner: TalkEndpoint;
  readonly channelId: string;
  readonly kind: TalkMessageKind;
  readonly speaker: TalkSpeaker;
  readonly stopSource: () => void;
  readonly skipCamera: string | null;
}

export class Transmissions {
  private readonly recordings = new Map<string, Recording>();
  private readonly started = new Map<string, Promise<unknown>>();
  private listening: Pick<TalkListening, 'open'> | null = null;

  constructor(private readonly options: TransmissionsOptions) {}

  attachListening(listening: Pick<TalkListening, 'open'>): void {
    this.listening = listening;
  }

  limitOf(kind: TalkMessageKind): number {
    return kind === 'talk' ? TALK_SECONDS_MAX : LISTEN_SECONDS_MAX;
  }

  talk(owner: TalkEndpoint, channelId: string): Transmission {
    return this.open({
      owner,
      channelId,
      kind: 'talk',
      speaker: this.speaker(channelId, 'client', owner.clientId),
      stopSource: () => undefined,
      skipCamera: null,
    });
  }

  listen(owner: TalkEndpoint, channelId: string, cameraId: string, feed: CameraFeed): Transmission {
    let stop: () => void = () => undefined;
    let stopped = false;
    const transmission = this.open({
      owner,
      channelId,
      kind: 'listen',
      speaker: this.speaker(channelId, 'camera', cameraId),
      stopSource: () => {
        stopped = true;
        stop();
      },
      skipCamera: cameraId,
    });
    this.options.microphones
      .open(cameraId, {
        packet: (packet) => {
          feed.packet(transmission, packet);
        },
        ended: (failure) => {
          feed.ended(transmission, failure);
        },
      })
      .then(
        (microphone) => {
          stop = microphone.stop;
          if (stopped) {
            microphone.stop();
          }
        },
        (cause: unknown) => {
          feed.ended(transmission, messageOf(cause));
        },
      );
    return transmission;
  }

  async finish(transmission: Transmission, bytes: number): Promise<void> {
    const started = this.started.get(transmission.messageId);
    this.started.delete(transmission.messageId);
    transmission.stopSource();
    transmission.sinks.forEach((sink) => {
      sink.end();
    });
    const recording = this.recordings.get(transmission.messageId);
    this.recordings.delete(transmission.messageId);
    await started;
    const saved = recording === undefined ? false : await recording.saved();
    const channel = this.options.membership.channel(transmission.channelId);
    if (channel === undefined) {
      if (recording !== undefined) {
        await this.options.recorder.remove(recording.storagePath);
      }
      return;
    }
    await this.options.store.host.call('talk', 'finishMessage', transmission.messageId, {
      durationMs: this.options.now().getTime() - transmission.startedAt.getTime(),
      bytes: saved ? bytes : 0,
      storagePath: saved && recording !== undefined ? recording.storagePath : null,
    });
    await this.options.recorder.prune(channel);
  }

  private open(opening: Opening): Transmission {
    const messageId = randomUUID();
    const startedAt = this.options.now();
    const started = this.options.store.host.call('talk', 'startMessage', {
      id: messageId,
      channel_id: opening.channelId,
      speaker_kind: opening.speaker.kind,
      speaker_id: opening.speaker.id,
      speaker_label: opening.speaker.label,
      speaker_detail: opening.speaker.detail,
      kind: opening.kind,
      started_at: startedAt.toISOString(),
    });
    this.started.set(messageId, started);
    background(started, 'talk.message_start_failed', { messageId });
    return {
      messageId,
      channelId: opening.channelId,
      kind: opening.kind,
      speaker: opening.speaker,
      startedAt,
      owner: opening.owner,
      sinks: this.sinksFor(opening, messageId),
      stopSource: opening.stopSource,
    };
  }

  private sinksFor(opening: Opening, messageId: string): PacketSink[] {
    const channel = this.options.membership.channel(opening.channelId);
    const sinks: PacketSink[] = this.options.membership
      .speakerCameras(opening.channelId)
      .filter((cameraId) => cameraId !== opening.skipCamera)
      .map((cameraId) => this.options.speakers.open(cameraId, messageId, 'talk'));
    if (channel !== undefined && channel.keep_hours > 0) {
      const recording = this.options.recorder.open(opening.channelId, messageId);
      this.recordings.set(messageId, recording);
      sinks.push(recording);
    }
    if (channel?.ai_listens === true && opening.kind === 'talk' && this.listening !== null) {
      sinks.push(this.listening.open(channel, messageId, opening.speaker));
    }
    return sinks;
  }

  private speaker(channelId: string, kind: TalkMemberKind, id: string): TalkSpeaker {
    return { kind, id, ...this.options.membership.labelOf(channelId, kind, id) };
  }
}
