import type { AdapterSink, DeviceEvent } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { cameraEventKinds, parseCameraEventPage, type CameraEvent } from '@smarteverything/xiaomi';
import type { XiaomiCloud } from './cloud-api';
import { startLoop, type Loop } from './loop';

const PAGE_LIMIT = 20;

export interface CameraEventSource {
  readonly did: string;
  readonly model: string;
  readonly doorbell: boolean;
}

export type CameraEventTrigger = 'lan-push' | 'timer';

export class CameraEventPoller {
  private seenUntil: number;
  private loop: Loop | null = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private followUp: NodeJS.Timeout | null = null;

  constructor(
    private readonly camera: CameraEventSource,
    private readonly cloud: XiaomiCloud,
    private readonly now: () => number,
    private readonly log: Logger,
  ) {
    this.seenUntil = now();
  }

  get trigger(): CameraEventTrigger {
    return this.loop === null ? 'lan-push' : 'timer';
  }

  useTimer(sink: AdapterSink, intervalMs: number): void {
    this.loop ??= startLoop(
      () => intervalMs,
      () => this.fetch(sink),
    );
  }

  usePush(): void {
    this.loop?.stop();
    this.loop = null;
  }

  detected(sink: AdapterSink, followUpMs: number): void {
    void this.fetch(sink);
    if (this.followUp !== null) {
      clearTimeout(this.followUp);
    }
    this.followUp = setTimeout(() => {
      this.followUp = null;
      void this.fetch(sink);
    }, followUpMs);
  }

  stop(): void {
    this.usePush();
    if (this.followUp !== null) {
      clearTimeout(this.followUp);
      this.followUp = null;
    }
  }

  fetch(sink: AdapterSink): Promise<void> {
    if (this.inFlight !== null) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.poll(sink).finally(() => {
      this.inFlight = null;
      if (this.again) {
        this.again = false;
        void this.fetch(sink);
      }
    });
    return this.inFlight;
  }

  private async poll(sink: AdapterSink): Promise<void> {
    try {
      const endTime = this.now();
      const data = await this.cloud.cameraEvents({
        did: this.camera.did,
        model: this.camera.model,
        doorbell: this.camera.doorbell,
        beginTime: this.seenUntil + 1,
        endTime,
        limit: PAGE_LIMIT,
      });
      const page = parseCameraEventPage(data);
      if (page.malformed > 0) {
        this.log.warn('xiaomi_camera.events_unreadable', {
          did: this.camera.did,
          count: page.malformed,
        });
      }
      const fresh = page.events
        .filter((event) => event.createTime > this.seenUntil)
        .sort((first, second) => first.createTime - second.createTime);
      for (const event of fresh) {
        this.emit(sink, event);
      }
      this.seenUntil = Math.max(this.seenUntil, ...fresh.map((event) => event.createTime));
    } catch (error) {
      this.log.warn('xiaomi_camera.events_failed', { did: this.camera.did, reason: String(error) });
      sink.failure({
        provider: 'xiaomi',
        externalId: this.camera.did,
        operation: 'camera-events',
        cause: error,
      });
    }
  }

  private emit(sink: AdapterSink, event: CameraEvent): void {
    const { kinds, unrecognized } = cameraEventKinds(event.eventType);
    if (unrecognized.length > 0) {
      this.log.warn('xiaomi_camera.event_type_unknown', {
        did: this.camera.did,
        eventType: event.eventType,
        unrecognized,
      });
    }
    for (const kind of kinds) {
      const deviceEvent: DeviceEvent = {
        externalId: this.camera.did,
        kind,
        occurredAt: new Date(event.createTime).toISOString(),
        details: {
          source: 'camera-event-list',
          eventType: event.eventType,
          ...(event.fileId === undefined ? {} : { fileId: event.fileId }),
        },
      };
      sink.event(deviceEvent);
    }
  }
}
