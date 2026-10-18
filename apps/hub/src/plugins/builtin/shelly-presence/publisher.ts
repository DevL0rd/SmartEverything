import {
  SHELLY_SNAPSHOT_STREAM,
  SHELLY_TRACKS_STREAM,
  type ShellyDevice,
  type ShellySnapshot,
  type ShellyTracks,
} from '@smarteverything/shelly';
import type { PluginContext } from '../contract';
import { jsonOf } from '../json-value';
import { shellySearch } from './search';
import type { ShellySettings } from './settings';

export type ShellyPublishPorts = Pick<PluginContext<ShellySettings>, 'data' | 'search'>;

export function publicSensor(sensor: ShellyDevice): ShellyDevice {
  if (sensor.resources === undefined) return sensor;
  const resources = { ...sensor.resources };
  delete resources.storedValues;
  return { ...sensor, resources };
}

export class ShellyPublisher {
  private readonly tracks = new Map<string, ShellyTracks['devices'][number]>();
  private inventoryQueued = false;
  private reindexQueued = false;
  private lastInventory: string | null = null;
  private lastTracks = JSON.stringify({ devices: [] });
  private stopped = false;

  constructor(
    private readonly ports: ShellyPublishPorts,
    private readonly sensors: () => readonly ShellyDevice[],
  ) {}

  inventoryChanged(reindex: boolean): void {
    this.reindexQueued ||= reindex;
    if (this.inventoryQueued) return;
    this.inventoryQueued = true;
    queueMicrotask(() => {
      this.inventoryQueued = false;
      if (!this.stopped) this.publishInventory();
    });
  }

  tracksChanged(sensor: ShellyDevice): void {
    if (sensor.tracksAt === null) this.tracks.delete(sensor.id);
    else
      this.tracks.set(sensor.id, {
        id: sensor.id,
        tracks: sensor.tracks,
        tracksAt: sensor.tracksAt,
      });
    this.publishTracks();
  }

  forget(id: string): void {
    this.tracks.delete(id);
    this.publishTracks();
    this.inventoryChanged(true);
  }

  stop(): void {
    this.publishInventory();
    this.stopped = true;
  }

  private publishInventory(): void {
    const devices = this.sensors().map((sensor) => ({
      ...publicSensor(sensor),
      tracks: [],
      tracksAt: null,
    }));
    const encoded = JSON.stringify(devices);
    if (encoded !== this.lastInventory) {
      this.lastInventory = encoded;
      const snapshot: ShellySnapshot = { at: new Date().toISOString(), devices };
      this.ports.data.publish(SHELLY_SNAPSHOT_STREAM, jsonOf(snapshot));
    }
    if (!this.reindexQueued) return;
    this.reindexQueued = false;
    this.ports.search.replace(shellySearch(devices));
  }

  private publishTracks(): void {
    const frame: ShellyTracks = { devices: [...this.tracks.values()] };
    const encoded = JSON.stringify(frame);
    if (encoded === this.lastTracks) return;
    this.lastTracks = encoded;
    this.ports.data.publish(SHELLY_TRACKS_STREAM, jsonOf(frame));
  }
}
