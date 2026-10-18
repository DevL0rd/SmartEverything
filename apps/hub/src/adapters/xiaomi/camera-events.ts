import { randomUUID } from 'node:crypto';
import {
  CAMERA_DETECTION_KINDS,
  type AdapterSink,
  type CameraDetection,
  type DeviceEvent,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  cameraEventDetections,
  parseCameraEventPage,
  type CameraEvent,
} from '@smarteverything/xiaomi';
import type { XiaomiCloud } from './cloud-api';
import type { CameraFollowUps } from './dependencies';
import { startLoop, type Loop } from './loop';
import { seconds } from './device-link';
import { background, failureLine } from '@smarteverything/logging';

const PAGE_LIMIT = 20;
const SAME_DETECTION_WITHIN_MS = 120_000;
const ANNOUNCED_KEPT_MS = 3_600_000;
const SAME_PUSH_GAP_MS = 30_000;
const SAME_PUSH_LONGEST_MS = 60_000;

export interface CameraEventSource {
  readonly did: string;
  readonly model: string;
  readonly doorbell: boolean;
}

export type CameraEventTrigger = 'lan-push' | 'timer';

interface Announced {
  readonly occurrence: string;
  readonly detection: CameraDetection;
  readonly firstMs: number;
  readonly lastMs: number;
}

export class CameraEventPoller {
  private seenUntil: number;
  private loop: Loop | null = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private readonly readsDue = new Set<number>();
  private readTimer: NodeJS.Timeout | null = null;
  private announced: readonly Announced[] = [];

  constructor(
    private readonly camera: CameraEventSource,
    private readonly cloud: Pick<XiaomiCloud, 'cameraEvents'>,
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

  detected(
    sink: AdapterSink,
    event: DeviceEvent,
    detection: CameraDetection,
    followUps: CameraFollowUps,
  ): void {
    const atMs = Date.parse(event.occurredAt);
    const kept = this.kept();
    const ongoing = kept.find(
      (entry) =>
        entry.detection === detection &&
        atMs - entry.lastMs <= SAME_PUSH_GAP_MS &&
        atMs - entry.firstMs <= SAME_PUSH_LONGEST_MS,
    );
    const occurrence = ongoing?.occurrence ?? randomUUID();
    this.announced = [
      ...kept.filter((entry) => entry !== ongoing),
      { occurrence, detection, firstMs: ongoing?.firstMs ?? atMs, lastMs: atMs },
    ];
    if (ongoing === undefined) {
      sink.event({ ...event, occurrence });
    }
    this.scheduleReads(sink, followUps);
  }

  stop(): void {
    this.usePush();
    this.readsDue.clear();
    this.disarm();
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
        background(this.fetch(sink), 'camera_events.fetch_failed');
      }
    });
    return this.inFlight;
  }

  private scheduleReads(sink: AdapterSink, followUps: CameraFollowUps): void {
    const base = this.now();
    for (const delayMs of followUps.delaysMs) {
      this.readsDue.add(Math.ceil((base + delayMs) / followUps.gridMs) * followUps.gridMs);
    }
    this.arm(sink);
  }

  private arm(sink: AdapterSink): void {
    this.disarm();
    const next = Math.min(...this.readsDue);
    if (!Number.isFinite(next)) {
      return;
    }
    this.readTimer = setTimeout(
      () => {
        this.readTimer = null;
        const due = [...this.readsDue].filter((at) => at <= this.now());
        for (const at of due) {
          this.readsDue.delete(at);
        }
        if (due.length > 0) {
          background(this.fetch(sink), 'camera_events.fetch_failed');
        }
        this.arm(sink);
      },
      Math.max(0, next - this.now()),
    );
  }

  private disarm(): void {
    if (this.readTimer !== null) {
      clearTimeout(this.readTimer);
      this.readTimer = null;
    }
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
      this.log.warn('xiaomi_camera.events_failed', {
        did: this.camera.did,
        reason: failureLine(error),
      });
      sink.failure({
        provider: 'xiaomi',
        externalId: this.camera.did,
        operation: 'camera-events',
        cause: error,
      });
    }
  }

  private emit(sink: AdapterSink, event: CameraEvent): void {
    const { detections, unrecognized } = cameraEventDetections(event.eventType);
    if (unrecognized.length > 0) {
      this.log.warn('xiaomi_camera.event_type_unknown', {
        did: this.camera.did,
        eventType: event.eventType,
        unrecognized,
      });
    }
    for (const detection of detections) {
      const announced = this.claim(detection, event.createTime);
      sink.event({
        externalId: this.camera.did,
        kind: CAMERA_DETECTION_KINDS[detection],
        occurredAt: new Date(event.createTime).toISOString(),
        details: {
          source: 'camera-event-list',
          eventType: event.eventType,
          detection,
          ...(event.fileId === undefined ? {} : { fileId: event.fileId }),
          ...(event.imgStoreId === undefined ? {} : { imgStoreId: event.imgStoreId }),
        },
        ...(announced === null ? {} : { occurrence: announced.occurrence }),
      });
    }
  }

  private kept(): readonly Announced[] {
    const oldestMs = this.now() - ANNOUNCED_KEPT_MS;
    return this.announced.filter(
      (entry) =>
        entry.lastMs >= oldestMs && this.seenUntil <= entry.lastMs + SAME_DETECTION_WITHIN_MS,
    );
  }

  private claim(detection: CameraDetection, atMs: number): Announced | null {
    const kept = this.kept();
    this.announced = kept;
    const near = kept.filter(
      (entry) =>
        entry.detection === detection &&
        atMs >= entry.firstMs - SAME_DETECTION_WITHIN_MS &&
        atMs <= entry.lastMs + SAME_DETECTION_WITHIN_MS,
    );
    const distance = (entry: Announced): number =>
      Math.max(entry.firstMs - atMs, atMs - entry.lastMs, 0);
    return near.reduce<Announced | null>(
      (best, entry) => (best === null || distance(entry) < distance(best) ? entry : best),
      null,
    );
  }
}

export function cameraEventsDetail(poller: CameraEventPoller, pollMs: number): string {
  const interval = seconds(pollMs);
  return poller.trigger === 'lan-push'
    ? 'pushed over the LAN at once; the cloud event list adds the clip afterwards'
    : `cloud event list every ${interval} s: the camera has no LAN push subscription`;
}
