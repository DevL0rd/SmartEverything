import {
  ApiError,
  NO_FAULT_TEXT,
  VACUUM_FAULT_KEY,
  VACUUM_ROOM_LINKS_KEY,
  type CapabilityKey,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type Provider,
  type RowChange,
  type StateChange,
  type StateUpdate,
  type VacuumScene,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Route, VacuumCommand } from '@smarteverything/xiaomi';
import type { DeviceRecord } from '../database/port';
import { deviceTarget } from '../metrics/viewers';
import type { VacuumRouteServices } from '../server/handlers/vacuums';
import type { Store } from '../store/store';
import { cleanMapOf, cleanTrackerOf } from './assemble';
import { isVacuumModel, vacuumPropertyKey } from './capabilities';
import type { VacuumCleanTracker } from './clean-tracker';
import { runVacuumCommand } from './command-service';
import { VacuumEventFeed, isVacuumFeedKey } from './event-feed';
import { VacuumLinkSlot, type VacuumDeviceIo } from './link';
import { VacuumLiveRoute, type LiveRouteUpdate, type RouteTimer } from './live-route';
import { VacuumLiveScene } from './live-scene';
import { MapCache } from './map-cache';
import { MapFetcher, type MapIdentity } from './map-fetch';
import { VacuumMapPublication } from './map-publication';
import { VacuumMapService } from './map-service';
import { pushedObjectsOf } from './pushed-objects';
import { VacuumRoomLinks } from './room-links';
import type { ViewerSource } from './viewer-demand';
import { VacuumVideo, type VacuumVideoPorts } from './video-session';

export interface VacuumHubPorts {
  readonly store: Pick<
    Store,
    'devices' | 'vacuumScenes' | 'vacuumCleans' | 'vacuumRoomLinks' | 'rooms'
  >;
  readonly state: {
    readonly valueOf: (deviceId: string, key: CapabilityKey) => JsonValue | undefined;
    readonly push: (provider: Provider, update: StateUpdate) => void;
  };
  readonly events: { readonly fromProvider: (provider: Provider, event: DeviceEvent) => void };
  readonly viewers: ViewerSource;
  readonly timer: RouteTimer;
  readonly video: VacuumVideoPorts;
  readonly now: () => Date;
  readonly log: Logger;
}

const FAULT_SOURCES: ReadonlySet<CapabilityKey> = new Set([
  vacuumPropertyKey('fault-ids'),
  vacuumPropertyKey('fault'),
]);

function isMapVacuum(device: DeviceRow | undefined): device is DeviceRow {
  return device?.provider === 'xiaomi' && isVacuumModel(device.model);
}

export class VacuumHub {
  readonly link = new VacuumLinkSlot();
  readonly cache: MapCache;
  private readonly tasks = new Map<string, number | null>();
  private readonly attached = new Set<string>();
  private readonly videoFollows = new Map<string, () => void>();
  private readonly feed: VacuumEventFeed;
  private readonly publication: VacuumMapPublication;
  private readonly fetcher: MapFetcher;
  private readonly route: VacuumLiveRoute;
  private readonly liveScene: VacuumLiveScene;
  private readonly maps: VacuumMapService;
  private readonly cleans: VacuumCleanTracker;
  private readonly video: VacuumVideo;
  private readonly roomLinks: VacuumRoomLinks;
  private started = false;

  constructor(private readonly ports: VacuumHubPorts) {
    this.cache = new MapCache(ports.store.vacuumScenes);
    this.liveScene = new VacuumLiveScene({
      cache: this.cache,
      route: (deviceId): Route | null => this.route.route(deviceId),
    });
    this.feed = new VacuumEventFeed(ports.log);
    this.publication = this.publicationOf();
    this.roomLinks = this.roomLinksOf();
    this.cleans = this.trackerOf();
    this.fetcher = this.fetcherOf();
    this.route = new VacuumLiveRoute({
      io: (deviceId): VacuumDeviceIo | null => this.ioOf(deviceId),
      timer: ports.timer,
      changed: (deviceId, update): void => {
        this.routeChanged(deviceId, update);
      },
      log: ports.log,
    });
    this.video = new VacuumVideo({
      ...ports.video,
      devices: ports.store.devices,
      viewers: ports.viewers,
      io: (deviceId): VacuumDeviceIo | null => this.ioOf(deviceId),
      now: ports.now,
      log: ports.log,
    });
    this.maps = new VacuumMapService({
      fetcher: this.fetcher,
      route: this.route,
      viewers: ports.viewers,
      target: deviceTarget,
      current: ports.state.valueOf,
      log: ports.log,
    });
  }

  observe(change: StateChange): void {
    this.cleans.observe(change);
    if (!this.attached.has(change.deviceId)) return;
    background(
      this.maps.observe(change.deviceId, change.capability, change.value),
      'vacuum_map.observe_failed',
      { deviceId: change.deviceId, capability: change.capability },
    );
    if (isVacuumFeedKey(change.capability)) this.recordFeed(change);
  }

  rowChanged(change: RowChange): void {
    if (change.table !== 'rooms' || change.operation === 'INSERT') return;
    for (const deviceId of this.attached) this.roomLinks.publish(deviceId);
  }

  claim(device: DeviceRecord, event: DeviceEvent): boolean {
    return this.cleans.claim(device, event);
  }

  start(devices: readonly DeviceRecord[]): void {
    this.started = true;
    this.sync(devices);
  }

  sync(devices: readonly DeviceRecord[]): void {
    if (!this.started) return;
    const present = new Set(devices.map((device) => device.id));
    for (const deviceId of [...this.attached].filter((id) => !present.has(id))) {
      this.detach(deviceId);
    }
    for (const device of devices) {
      if (!this.attached.has(device.id) && isMapVacuum(this.ports.store.devices.find(device.id))) {
        this.attach(device.id);
      }
    }
  }

  async stop(): Promise<void> {
    for (const deviceId of [...this.attached]) this.detach(deviceId);
    this.started = false;
    try {
      await this.video.closeAll();
    } catch (cause) {
      this.ports.log.error('vacuum_video.close_failed', cause);
    }
  }

  routes(): VacuumRouteServices {
    return {
      devices: this.ports.store.devices,
      scenes: this.cache,
      maps: this.maps,
      cleans: this.ports.store.vacuumCleans,
      video: this.video,
      roomLinks: this.roomLinks,
      control: {
        value: this.ports.state.valueOf,
        run: (deviceId, command) => this.run(deviceId, command),
      },
    };
  }

  private attach(deviceId: string): void {
    this.attached.add(deviceId);
    this.videoFollows.set(deviceId, this.video.follow(deviceId));
    this.maps.attach(deviceId);
    this.cleans.resume(deviceId);
    this.seedFaults(deviceId);
    this.roomLinks.attached(deviceId);
    this.ports.log.info('vacuum.attached', { deviceId });
  }

  private seedFaults(deviceId: string): void {
    const device = this.ports.store.devices.find(deviceId);
    if (device === undefined) return;
    this.feed.baseline(
      device.external_id,
      this.ports.state.valueOf(deviceId, vacuumPropertyKey('fault-ids')),
      this.ports.now().toISOString(),
    );
    this.publishFault(deviceId, device);
  }

  private detach(deviceId: string): void {
    this.attached.delete(deviceId);
    this.videoFollows.get(deviceId)?.();
    this.videoFollows.delete(deviceId);
    this.maps.detach(deviceId);
    this.tasks.delete(deviceId);
    this.ports.log.info('vacuum.detached', { deviceId });
  }

  private async run(deviceId: string, command: VacuumCommand): Promise<void> {
    const io = this.ioOf(deviceId);
    if (io === null) {
      throw new ApiError(
        'conflict',
        'The robot cannot be reached: the Xiaomi account is not running or the robot is offline.',
      );
    }
    await runVacuumCommand(io, command);
  }

  private ioOf(deviceId: string): VacuumDeviceIo | null {
    const device = this.ports.store.devices.find(deviceId);
    return device === undefined ? null : this.link.io(device.external_id);
  }

  private identityOf(deviceId: string): MapIdentity | null {
    const device = this.ports.store.devices.find(deviceId);
    return isMapVacuum(device) ? { model: device.model, did: device.external_id } : null;
  }

  private routeChanged(deviceId: string, update: LiveRouteUpdate): void {
    this.publication.pose(deviceId, update);
    const merged = this.liveScene.routed(deviceId);
    if (merged !== null) this.cleans.scenePublished(deviceId, merged);
  }

  private recordFeed(change: StateChange): void {
    const device = this.ports.store.devices.find(change.deviceId);
    if (device === undefined) return;
    const occurredAt = this.ports.now().toISOString();
    const events = this.feed.observe({ ...change, externalId: device.external_id, occurredAt });
    for (const event of events) this.ports.events.fromProvider(device.provider, event);
    if (FAULT_SOURCES.has(change.capability)) this.publishFault(change.deviceId, device);
  }

  private publishFault(deviceId: string, device: DeviceRow): void {
    const text = this.feed.faultText(device.external_id);
    const stored = this.ports.state.valueOf(deviceId, VACUUM_FAULT_KEY) ?? NO_FAULT_TEXT;
    if (stored === text) return;
    this.ports.state.push(device.provider, {
      externalId: device.external_id,
      capability: VACUUM_FAULT_KEY,
      value: text,
      observedAt: this.ports.now().toISOString(),
    });
  }

  private owned(deviceId: string): DeviceRow | undefined {
    const device = this.ports.store.devices.find(deviceId);
    if (device === undefined) this.ports.log.warn('vacuum.device_unknown', { deviceId });
    return device;
  }

  private publicationOf(): VacuumMapPublication {
    return new VacuumMapPublication({
      state: (update): void => {
        const device = this.owned(update.externalId);
        if (device !== undefined) {
          this.ports.state.push(device.provider, { ...update, externalId: device.external_id });
        }
      },
      event: (event): void => {
        const device = this.owned(event.externalId);
        if (device !== undefined) {
          this.ports.events.fromProvider(device.provider, {
            ...event,
            externalId: device.external_id,
          });
        }
      },
      now: this.ports.now,
      log: this.ports.log,
    });
  }

  private roomLinksOf(): VacuumRoomLinks {
    const { store, state, now, log } = this.ports;
    return new VacuumRoomLinks({
      links: store.vacuumRoomLinks,
      rooms: store.rooms,
      scene: (deviceId): VacuumScene | undefined => this.cache.latest(deviceId, 'current'),
      stored: (deviceId): JsonValue | undefined => state.valueOf(deviceId, VACUUM_ROOM_LINKS_KEY),
      publish: (deviceId, text): void => {
        const device = this.owned(deviceId);
        if (device === undefined) return;
        state.push(device.provider, {
          externalId: device.external_id,
          capability: VACUUM_ROOM_LINKS_KEY,
          value: text,
          observedAt: now().toISOString(),
        });
      },
      log,
    });
  }

  private trackerOf(): VacuumCleanTracker {
    const { store, state, events, now, log } = this.ports;
    return cleanTrackerOf(
      {
        store,
        cleans: store.vacuumCleans,
        map: cleanMapOf(this.cache, (deviceId) => this.tasks.get(deviceId) ?? null),
        now,
        log,
      },
      () => ({ state, events }),
    );
  }

  private fetcherOf(): MapFetcher {
    const { state, now, log } = this.ports;
    return new MapFetcher({
      cloud: this.link.cloud,
      cache: this.cache,
      identity: (deviceId) => this.identityOf(deviceId),
      pushed: (deviceId) => pushedObjectsOf(deviceId, (key) => state.valueOf(deviceId, key), log),
      published: (deviceId: string, fetched: VacuumScene): void => {
        const scene = this.liveScene.fetched(deviceId, fetched);
        this.publication.published(deviceId, scene);
        this.roomLinks.sceneChanged(deviceId, scene);
        this.cleans.scenePublished(deviceId, scene);
      },
      task: (deviceId, taskId): void => {
        this.tasks.set(deviceId, taskId);
      },
      route: (deviceId, route): void => {
        this.liveScene.blob(deviceId, route);
      },
      unreadable: this.publication.unreadable,
      savedMaps: this.publication.savedMaps,
      now,
      log,
    });
  }
}
