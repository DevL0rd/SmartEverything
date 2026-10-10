import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { isCamera, type LiveChange, type TalkPresence } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Go2rtcClient } from '../cameras/go2rtc-client';
import type { Store } from '../store/store';
import { CameraMicrophones } from './camera-microphone';
import { CameraVideo } from './camera-video';
import { CameraSpeakers } from './camera-speaker';
import { TalkFeeds } from './feeds';
import { memberLabel } from './labels';
import { TalkMembership } from './membership';
import { TalkRecorder } from './recorder';
import type { LiveConversation } from './live-sessions';
import { TalkRelay, type LiveOpening } from './relay';
import type { TalkListening } from './talk-listening';
import { TalkSockets } from './talk-sockets';
import { Transmissions } from './transmissions';

export interface TalkServiceOptions {
  readonly store: Store;
  readonly go2rtc: Pick<Go2rtcClient, 'play'>;
  readonly streamReady: (deviceId: string) => Promise<void>;
  readonly rtspPort: number;
  readonly dataDirectory: string;
  readonly presence: (presence: TalkPresence) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export class TalkService {
  readonly recorder: TalkRecorder;
  readonly camera: {
    readonly speakers: CameraSpeakers;
    readonly microphones: CameraMicrophones;
    readonly video: CameraVideo;
  };
  private readonly transmissions: Transmissions;
  private readonly feeds: TalkFeeds;
  private readonly membership: TalkMembership;
  private readonly relay: TalkRelay;
  private readonly sockets: TalkSockets;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: TalkServiceOptions) {
    const { store, log } = options;
    this.feeds = new TalkFeeds(log);
    this.membership = new TalkMembership(store);
    this.recorder = new TalkRecorder({
      store,
      dataDirectory: options.dataDirectory,
      now: options.now,
      log,
    });
    const speakers = new CameraSpeakers({
      go2rtc: options.go2rtc,
      feeds: this.feeds,
      ready: options.streamReady,
      log,
    });
    const microphones = new CameraMicrophones({
      rtspPort: options.rtspPort,
      ready: options.streamReady,
      log,
    });
    const video = new CameraVideo({ rtspPort: options.rtspPort, ready: options.streamReady, log });
    const transmissions = new Transmissions({
      store,
      membership: this.membership,
      recorder: this.recorder,
      speakers,
      microphones,
      now: options.now,
      log,
    });
    this.transmissions = transmissions;
    this.relay = new TalkRelay({
      membership: this.membership,
      transmissions,
      speakers,
      microphones,
      presence: options.presence,
      log,
    });
    this.sockets = new TalkSockets({ store, relay: this.relay, log });
    this.camera = { speakers, microphones, video };
  }

  async start(): Promise<void> {
    await this.feeds.start();
    await this.recorder.clearUnfinished();
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      this.changed(change);
    });
  }

  attachListening(listening: Pick<TalkListening, 'open'>): void {
    this.transmissions.attachListening(listening);
  }

  openLive(channelId: string, conversation: LiveConversation): LiveOpening {
    return this.relay.openLive(channelId, conversation);
  }

  presence(): TalkPresence {
    return this.relay.presence();
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.sockets.upgrade(request, socket, head);
  }

  stop(): void {
    this.unsubscribe?.();
    this.relay.stop();
    this.sockets.stop();
    this.feeds.stop();
  }

  private relabel(change: LiveChange): void {
    const { store } = this.options;
    if (change.operation !== 'UPDATE') {
      return;
    }
    const refresh = (kind: 'client' | 'camera', id: string): void => {
      store.talk.relabel(kind, id, memberLabel(store, kind, id));
    };
    if (change.table === 'clients' && change.record !== null) {
      refresh('client', change.record.id);
    } else if (change.table === 'devices' && change.record !== null && isCamera(change.record)) {
      refresh('camera', change.record.id);
    } else if (change.table === 'profiles' && change.record !== null) {
      const profileId = change.record.id;
      store.clients
        .list()
        .filter((client) => client.profile_id === profileId)
        .forEach((client) => {
          refresh('client', client.id);
        });
    }
  }

  private changed(change: LiveChange): void {
    if (change.operation === 'DELETE' && change.table === 'clients' && change.oldRecord !== null) {
      this.sockets.closeClient(change.oldRecord.id);
      this.options.store.talk.forgetMember('client', change.oldRecord.id);
    }
    if (change.operation === 'DELETE' && change.table === 'devices' && change.oldRecord !== null) {
      this.options.store.talk.forgetMember('camera', change.oldRecord.id);
    }
    this.relabel(change);
    if (this.membership.affects(change)) {
      this.membership.reload();
      this.relay.membershipChanged();
    }
  }
}
