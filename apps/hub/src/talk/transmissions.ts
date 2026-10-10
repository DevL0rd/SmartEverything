import { randomUUID } from 'node:crypto';
import {
  LISTEN_SECONDS_MAX,
  TALK_SECONDS_MAX,
  type TalkMessageKind,
  type TalkSpeaker,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { CameraMicrophones } from './camera-microphone';
import type { CameraSpeakers } from './camera-speaker';
import { memberLabel } from './labels';
import type { TalkMembership } from './membership';
import type { Recording, TalkRecorder } from './recorder';
import type { PacketSink, TalkEndpoint, Transmission } from './transmission';

export interface TransmissionsOptions {
  readonly store: Store;
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

  constructor(private readonly options: TransmissionsOptions) {}

  limitOf(kind: TalkMessageKind): number {
    return kind === 'talk' ? TALK_SECONDS_MAX : LISTEN_SECONDS_MAX;
  }

  talk(owner: TalkEndpoint, channelId: string): Transmission {
    return this.open({
      owner,
      channelId,
      kind: 'talk',
      speaker: this.clientSpeaker(owner.clientId),
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
      speaker: this.cameraSpeaker(cameraId),
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
          feed.ended(transmission, cause instanceof Error ? cause.message : String(cause));
        },
      );
    return transmission;
  }

  async finish(transmission: Transmission, bytes: number): Promise<void> {
    transmission.stopSource();
    transmission.sinks.forEach((sink) => {
      sink.end();
    });
    const recording = this.recordings.get(transmission.messageId);
    this.recordings.delete(transmission.messageId);
    const saved = recording === undefined ? false : await recording.saved();
    const channel = this.options.membership.channel(transmission.channelId);
    if (channel === undefined) {
      if (recording !== undefined) {
        await this.options.recorder.remove(recording.storagePath);
      }
      return;
    }
    this.options.store.talk.finishMessage(transmission.messageId, {
      durationMs: this.options.now().getTime() - transmission.startedAt.getTime(),
      bytes: saved ? bytes : 0,
      storagePath: saved && recording !== undefined ? recording.storagePath : null,
    });
    await this.options.recorder.prune(channel);
  }

  private open(opening: Opening): Transmission {
    const messageId = randomUUID();
    const startedAt = this.options.now();
    this.options.store.talk.startMessage({
      id: messageId,
      channel_id: opening.channelId,
      speaker_kind: opening.speaker.kind,
      speaker_id: opening.speaker.id,
      speaker_label: opening.speaker.label,
      speaker_detail: opening.speaker.detail,
      kind: opening.kind,
      started_at: startedAt.toISOString(),
    });
    return {
      messageId,
      channelId: opening.channelId,
      kind: opening.kind,
      speaker: opening.speaker,
      startedAt,
      owner: opening.owner,
      sinks: this.sinksFor(opening.channelId, messageId, opening.skipCamera),
      stopSource: opening.stopSource,
    };
  }

  private sinksFor(channelId: string, messageId: string, skipCamera: string | null): PacketSink[] {
    const channel = this.options.membership.channel(channelId);
    const sinks: PacketSink[] = this.options.membership
      .speakerCameras(channelId)
      .filter((cameraId) => cameraId !== skipCamera)
      .flatMap((cameraId) => this.options.speakers.open(cameraId, messageId, 'talk') ?? []);
    if (channel !== undefined && channel.keep_hours > 0) {
      const recording = this.options.recorder.open(channelId, messageId);
      this.recordings.set(messageId, recording);
      sinks.push(recording);
    }
    return sinks;
  }

  private clientSpeaker(clientId: string): TalkSpeaker {
    return { kind: 'client', id: clientId, ...memberLabel(this.options.store, 'client', clientId) };
  }

  private cameraSpeaker(cameraId: string): TalkSpeaker {
    return { kind: 'camera', id: cameraId, ...memberLabel(this.options.store, 'camera', cameraId) };
  }
}
