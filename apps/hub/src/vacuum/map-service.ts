import {
  VACUUM_SLOTS,
  isVacuumTaskPhase,
  vacuumPhase,
  type CapabilityKey,
  type JsonValue,
  type VacuumSlot,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { vacuumProperty } from '@smarteverything/xiaomi';
import { vacuumPropertyKey } from './capabilities';
import type { VacuumLiveRoute } from './live-route';
import type { MapFetcher } from './map-fetch';
import { VacuumViewerDemand, type ViewerSource } from './viewer-demand';

export type MapFeed = Pick<MapFetcher, 'observePush' | 'notePush' | 'demand'>;

export type RouteControl = Pick<VacuumLiveRoute, 'start' | 'stop' | 'reset'>;

export interface MapServicePorts {
  readonly fetcher: MapFeed;
  readonly route: RouteControl;
  readonly viewers: ViewerSource;
  readonly target: (deviceId: string) => string;
  readonly current: (deviceId: string, key: CapabilityKey) => JsonValue | undefined;
  readonly log: Logger;
}

type Run = 'idle' | 'paused' | 'moving';

interface Facts {
  run: Run;
  locating: boolean;
}

const MAP_PROPERTY_NAMES: Readonly<Record<VacuumSlot, string>> = {
  current: 'map-obj-name',
  saved: 'map-management',
  backup: 'backup-map-list',
};

const POST_RUN_STATION: readonly JsonValue[] = [14, 'StationWorking'];

function mapKeyOf(slot: VacuumSlot): CapabilityKey {
  const { siid, piid } = vacuumProperty('vacuumMap', MAP_PROPERTY_NAMES[slot]);
  return `raw:${String(siid)}.${String(piid)}`;
}

export const VACUUM_MAP_KEYS: Readonly<Record<VacuumSlot, CapabilityKey>> = {
  current: mapKeyOf('current'),
  saved: mapKeyOf('saved'),
  backup: mapKeyOf('backup'),
};

export const VACUUM_STATUS_KEY = vacuumPropertyKey('status');

export const VACUUM_LOCATING_KEY = vacuumPropertyKey('location-status');

const SLOT_OF_KEY: ReadonlyMap<string, VacuumSlot> = new Map(
  VACUUM_SLOTS.map((slot) => [VACUUM_MAP_KEYS[slot], slot]),
);

export function runOf(status: JsonValue | undefined): Run {
  if (status === undefined) return 'idle';
  const phase = vacuumPhase({ vacuum_status: status });
  if (phase === 'paused' || phase === 'mapping_paused') return 'paused';
  return isVacuumTaskPhase(phase) && !POST_RUN_STATION.includes(status) ? 'moving' : 'idle';
}

export class VacuumMapService {
  private readonly facts = new Map<string, Facts>();
  private readonly demand: VacuumViewerDemand;

  constructor(private readonly ports: MapServicePorts) {
    this.demand = new VacuumViewerDemand({
      viewers: ports.viewers,
      target: ports.target,
      changed: (deviceId, watched): void => {
        this.viewerChanged(deviceId, watched);
      },
    });
  }

  attach(deviceId: string): void {
    const { current } = this.ports;
    if (!this.facts.has(deviceId)) {
      this.facts.set(deviceId, {
        run: runOf(current(deviceId, VACUUM_STATUS_KEY)),
        locating: current(deviceId, VACUUM_LOCATING_KEY) === true,
      });
    }
    this.demand.attach(deviceId);
    this.reevaluate(deviceId);
  }

  detach(deviceId: string): void {
    this.demand.detach(deviceId);
    this.ports.route.stop(deviceId);
    this.facts.delete(deviceId);
  }

  observe(deviceId: string, capability: CapabilityKey, value: JsonValue): Promise<void> {
    if (capability === VACUUM_STATUS_KEY) return this.status(deviceId, value);
    if (capability === VACUUM_LOCATING_KEY) {
      this.locating(deviceId, value === true);
      return Promise.resolve();
    }
    const slot = SLOT_OF_KEY.get(capability);
    return slot === undefined ? Promise.resolve() : this.mapPush(deviceId, slot, value);
  }

  ensure(deviceId: string, slot: VacuumSlot): Promise<void> {
    const value = this.ports.current(deviceId, VACUUM_MAP_KEYS[slot]);
    if (value === undefined) {
      this.ports.log.info('vacuum_map.ensure_without_index', { deviceId, slot });
      return Promise.resolve();
    }
    this.ports.log.info('vacuum_map.ensure', { deviceId, slot });
    return this.ports.fetcher.observePush(deviceId, slot, value);
  }

  private factsOf(deviceId: string): Facts {
    const held = this.facts.get(deviceId);
    if (held !== undefined) return held;
    const created: Facts = { run: 'idle', locating: false };
    this.facts.set(deviceId, created);
    return created;
  }

  private async status(deviceId: string, value: JsonValue): Promise<void> {
    const facts = this.factsOf(deviceId);
    const before = facts.run;
    facts.run = runOf(value);
    if (before === facts.run) return;
    if (before === 'idle') this.ports.route.reset(deviceId);
    this.reevaluate(deviceId);
    if (facts.run === 'idle') await this.endOfRun(deviceId);
  }

  private locating(deviceId: string, locating: boolean): void {
    const facts = this.factsOf(deviceId);
    if (!facts.locating && locating) this.ports.route.reset(deviceId);
    facts.locating = locating;
    this.reevaluate(deviceId);
  }

  private async endOfRun(deviceId: string): Promise<void> {
    this.ports.log.info('vacuum_map.run_ended', { deviceId });
    await Promise.all(VACUUM_SLOTS.map((slot) => this.ports.fetcher.demand(deviceId, slot)));
  }

  private mapPush(deviceId: string, slot: VacuumSlot, value: JsonValue): Promise<void> {
    const { fetcher, log } = this.ports;
    if (this.factsOf(deviceId).run !== 'idle' && !this.demand.watched(deviceId)) {
      fetcher.notePush(deviceId, slot, value);
      log.debug('vacuum_map.deferred_while_running', { deviceId, slot });
      return Promise.resolve();
    }
    return fetcher.observePush(deviceId, slot, value);
  }

  private viewerChanged(deviceId: string, watched: boolean): void {
    this.reevaluate(deviceId);
    this.ports.log.info(watched ? 'vacuum_map.viewer_opened' : 'vacuum_map.viewer_left', {
      deviceId,
    });
    if (watched) {
      background(this.ensure(deviceId, 'current'), 'vacuum_map.open_fetch_failed', { deviceId });
    }
  }

  private reevaluate(deviceId: string): void {
    const facts = this.factsOf(deviceId);
    const live = this.demand.watched(deviceId) && facts.run === 'moving' && !facts.locating;
    if (live) this.ports.route.start(deviceId);
    else this.ports.route.stop(deviceId);
  }
}
