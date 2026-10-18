import type {
  CameraQuality,
  CameraRow,
  EventKind,
  JsonValue,
  MediaSize,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceRecord, HubDatabase } from '../database/port';
import type { RecordedEvent } from '../state/event-router';
import { cameraSourceOf } from '../state/inventory';
import { FrameCache } from './frame-cache';
import type { Go2rtcClient } from './go2rtc-client';
import { CameraTalkUnsupportedError, CameraViewers, listenOnly } from './viewers';

export const CLIP_SECONDS = 15;

const RECORDED_KINDS: ReadonlySet<EventKind> = new Set([
  'doorbell',
  'call',
  'motion',
  'person',
  'pet',
  'sound',
  'alarm',
]);

export interface CameraConditions {
  readonly online: (deviceId: string) => boolean;
  readonly privacyOn: (deviceId: string) => boolean;
  readonly twoWayAudio: (deviceId: string) => boolean;
}

export interface CameraServiceOptions {
  readonly client: Go2rtcClient;
  readonly conditions: CameraConditions;
  readonly store: Pick<HubDatabase, 'loadCameras' | 'storeRecording'>;
  readonly now: () => Date;
  readonly log: Logger;
}

function h264Transcode(stream: string): string {
  return `ffmpeg:${stream}#video=h264`;
}

const TILE_SUFFIX = '~tile';

export function tileStreamOf(deviceId: string): string {
  return `${deviceId}${TILE_SUFFIX}`;
}

function tileSourceOf(source: string): string | null {
  if (!source.startsWith('xiaomi:')) {
    return null;
  }
  const url = new URL(source);
  url.searchParams.set('subtype', 'sd');
  return url.toString();
}

export class UnknownStreamError extends Error {
  override readonly name = 'UnknownStreamError';

  constructor(stream: string) {
    super(`There is no camera stream named ${stream} on this hub.`);
  }
}

export class CameraOfflineError extends Error {
  override readonly name = 'CameraOfflineError';

  constructor(deviceId: string) {
    super(`The camera ${deviceId} is offline, so it has no stream, snapshot or clip.`);
  }
}

export class CameraPrivacyError extends Error {
  override readonly name = 'CameraPrivacyError';

  constructor(deviceId: string) {
    super(`The camera ${deviceId} is switched off for privacy, so it streams nothing.`);
  }
}

function compactTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:.]/g, '');
}

export class CameraService {
  private readonly streams = new Map<string, string>();
  private readonly tiles = new Set<string>();
  private readonly recordEvents = new Map<string, boolean>();
  private syncing: Promise<void> = Promise.resolve();
  private readonly frames: FrameCache;
  private readonly viewers: CameraViewers;

  constructor(private readonly options: CameraServiceOptions) {
    this.frames = new FrameCache({
      client: options.client,
      now: (): number => options.now().getTime(),
      log: options.log,
    });
    this.viewers = new CameraViewers(options.client, options.log);
  }

  async load(): Promise<void> {
    for (const camera of await this.options.store.loadCameras()) {
      this.recordEvents.set(camera.deviceId, camera.recordEvents);
    }
  }

  sync(devices: readonly DeviceRecord[]): Promise<void> {
    const run = this.syncing.then(() => this.syncNow(devices));
    this.syncing = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async syncNow(devices: readonly DeviceRecord[]): Promise<void> {
    const startedAt = this.options.now().getTime();
    try {
      await this.syncStreams(devices);
    } catch (cause) {
      this.options.log.error('stream.sync_failed', cause, {
        devices: devices.length,
        registered: this.streams.size,
        durationMs: this.options.now().getTime() - startedAt,
      });
      throw cause;
    }
    this.options.log.debug('stream.synced', () => ({
      devices: devices.length,
      registered: this.streams.size,
      tiles: this.tiles.size,
      durationMs: this.options.now().getTime() - startedAt,
    }));
  }

  private async syncStreams(devices: readonly DeviceRecord[]): Promise<void> {
    for (const device of devices) {
      const source = cameraSourceOf(device);
      const registered = this.streams.get(device.id);
      if (source !== null && source !== registered) {
        await this.options.client.putStream(device.id, [source, h264Transcode(device.id)]);
        await this.putTile(device.id, source);
        this.streams.set(device.id, source);
        this.options.log.info('stream.added', { deviceId: device.id });
      } else if (source === null && registered !== undefined) {
        await this.options.client.deleteStream(device.id);
        await this.putTile(device.id, null);
        this.streams.delete(device.id);
        this.options.log.info('stream.removed', { deviceId: device.id });
      }
    }
  }

  private async putTile(deviceId: string, source: string | null): Promise<void> {
    const name = tileStreamOf(deviceId);
    const tile = source === null ? null : tileSourceOf(source);
    if (source !== null && tile !== null) {
      await this.options.client.putStream(name, [tile, source, h264Transcode(name)]);
      this.tiles.add(deviceId);
    } else if (this.tiles.delete(deviceId)) {
      await this.options.client.deleteStream(name);
    }
  }

  async resync(devices: readonly DeviceRecord[]): Promise<void> {
    await this.syncing;
    this.streams.clear();
    this.tiles.clear();
    await this.sync(devices);
  }

  cameraChanged(camera: CameraRow): void {
    this.recordEvents.set(camera.device_id, camera.record_events);
  }

  hasStream(deviceId: string): boolean {
    return this.streams.has(deviceId);
  }

  async answer(
    deviceId: string,
    sdp: string,
    clientId: string,
    quality: CameraQuality,
  ): Promise<string> {
    const startedAt = this.options.now().getTime();
    await this.streamReady(deviceId);
    const stream =
      quality === 'tile' && this.tiles.has(deviceId) ? tileStreamOf(deviceId) : deviceId;
    try {
      const answer = await this.viewers.open({
        deviceId: stream,
        clientId,
        kind: 'view',
        answer: () => this.options.client.answer(stream, listenOnly(sdp)),
      });
      this.options.log.info('webrtc.answered', {
        deviceId,
        stream,
        talk: false,
        quality,
        clientId,
        offerLength: sdp.length,
        answerLength: answer.length,
        durationMs: this.options.now().getTime() - startedAt,
      });
      return answer;
    } catch (cause) {
      this.options.log.error('webrtc.answer_failed', cause, {
        deviceId,
        stream,
        talk: false,
        quality,
        clientId,
        durationMs: this.options.now().getTime() - startedAt,
      });
      throw cause;
    }
  }

  async talk(deviceId: string, sdp: string, clientId: string): Promise<string> {
    const startedAt = this.options.now().getTime();
    await this.streamReady(deviceId);
    if (!this.options.conditions.twoWayAudio(deviceId)) {
      this.options.log.warn('webrtc.talk_unsupported', { deviceId, clientId });
      throw new CameraTalkUnsupportedError(deviceId);
    }
    try {
      const answer = await this.viewers.open({
        deviceId,
        clientId,
        kind: 'talk',
        answer: () => this.options.client.answer(deviceId, sdp),
      });
      this.options.log.info('webrtc.answered', {
        deviceId,
        talk: true,
        clientId,
        offerLength: sdp.length,
        answerLength: answer.length,
        durationMs: this.options.now().getTime() - startedAt,
      });
      return answer;
    } catch (cause) {
      this.options.log.error('webrtc.answer_failed', cause, {
        deviceId,
        talk: true,
        clientId,
        durationMs: this.options.now().getTime() - startedAt,
      });
      throw cause;
    }
  }

  async snapshot(deviceId: string, size: MediaSize): Promise<Uint8Array> {
    await this.streamReady(deviceId);
    const startedAt = this.options.now().getTime();
    const frame = await this.frames.frame(deviceId, size);
    this.options.log.debug('snapshot.served', () => ({
      deviceId,
      size,
      bytes: frame.byteLength,
      durationMs: this.options.now().getTime() - startedAt,
    }));
    return frame;
  }

  async streamReady(deviceId: string): Promise<void> {
    await this.syncing;
    if (!this.streams.has(deviceId)) {
      this.options.log.debug('camera.stream_refused', { deviceId, reason: 'unknown_stream' });
      throw new UnknownStreamError(deviceId);
    }
    const { online, privacyOn } = this.options.conditions;
    if (!online(deviceId)) {
      this.options.log.debug('camera.stream_refused', { deviceId, reason: 'offline' });
      throw new CameraOfflineError(deviceId);
    }
    if (privacyOn(deviceId)) {
      this.options.log.debug('camera.stream_refused', { deviceId, reason: 'privacy_on' });
      throw new CameraPrivacyError(deviceId);
    }
  }

  async recordClip(deviceId: string, seconds: number): Promise<JsonValue> {
    await this.streamReady(deviceId);
    const startedAt = this.options.now();
    const path = `${deviceId}/${compactTime(startedAt.toISOString())}-manual.mp4`;
    const bytes = await this.options.client.clip(deviceId, seconds);
    this.options.log.debug('recording.captured', () => ({
      deviceId,
      kind: 'clip',
      seconds,
      bytes: bytes.byteLength,
      durationMs: this.options.now().getTime() - startedAt.getTime(),
    }));
    await this.options.store.storeRecording(
      { path, bytes, contentType: 'video/mp4' },
      {
        deviceId,
        eventId: null,
        kind: 'clip',
        storagePath: path,
        startedAt: startedAt.toISOString(),
        durationMs: seconds * 1000,
        bytes: bytes.byteLength,
      },
    );
    this.options.log.info('recording.stored', { deviceId, kind: 'clip', bytes: bytes.byteLength });
    return { storagePath: path, bytes: bytes.byteLength };
  }

  async record(event: RecordedEvent): Promise<void> {
    await this.syncing;
    const deviceId = event.deviceId;
    if (deviceId !== null) {
      this.frames.invalidate(deviceId);
    }
    if (
      deviceId === null ||
      !this.streams.has(deviceId) ||
      !RECORDED_KINDS.has(event.kind) ||
      this.recordEvents.get(deviceId) === false
    ) {
      return;
    }
    await Promise.all([
      this.capture(event, deviceId, 'snapshot'),
      this.capture(event, deviceId, 'clip'),
    ]);
  }

  private async capture(
    event: RecordedEvent,
    deviceId: string,
    kind: 'snapshot' | 'clip',
  ): Promise<void> {
    const extension = kind === 'snapshot' ? 'jpg' : 'mp4';
    const path = `${deviceId}/${compactTime(event.occurredAt)}.${extension}`;
    const startedAt = this.options.now();
    try {
      const bytes =
        kind === 'snapshot'
          ? await this.frames.frame(deviceId, 'full')
          : await this.options.client.clip(deviceId, CLIP_SECONDS);
      await this.options.store.storeRecording(
        { path, bytes, contentType: kind === 'snapshot' ? 'image/jpeg' : 'video/mp4' },
        {
          deviceId,
          eventId: event.id,
          kind,
          storagePath: path,
          startedAt: startedAt.toISOString(),
          durationMs: kind === 'clip' ? CLIP_SECONDS * 1000 : null,
          bytes: bytes.byteLength,
        },
      );
      this.options.log.info('recording.stored', {
        deviceId,
        kind,
        eventId: event.id,
        bytes: bytes.byteLength,
        durationMs: this.options.now().getTime() - startedAt.getTime(),
      });
    } catch (cause) {
      this.options.log.error('recording.failed', cause, {
        deviceId,
        kind,
        eventId: event.id,
        durationMs: this.options.now().getTime() - startedAt.getTime(),
      });
    }
  }
}
