import {
  HOME_MAP_VACUUM_CAPABILITIES,
  VACUUM_MAP_KEY,
  VACUUM_SAVED_MAPS,
  VACUUM_SAVED_MAPS_KEY,
  isHomeMapVacuumSettled,
  vacuumPhase,
  vacuumSavedMapVersion,
  vacuumSceneToSourceGeometry,
  vacuumSceneVersion,
  type CapabilityKey,
  type HomeMapSourceGeometry,
  type JsonValue,
  type VacuumSavedMap,
  type VacuumScene,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { isVacuumModel, vacuumPropertyKey } from '../../vacuum/capabilities';
import type {
  MapSource,
  MapSourceCapabilities,
  MapSourceChange,
  MapSourceListener,
  SourceInventory,
} from './registry';

const STATUS_KEY = vacuumPropertyKey('status');

export interface XiaomiVacuumSourcePorts {
  readonly scene: (deviceId: string) => VacuumScene | undefined;
  readonly robotMap: (deviceId: string, robotMapId: number) => VacuumScene | undefined;
  readonly value: (deviceId: string, key: CapabilityKey) => JsonValue | undefined;
  readonly log: Logger;
}

export interface RobotMapChange {
  readonly deviceId: string;
  readonly robotMapId: number;
  readonly version: string;
}

export type RobotMapListener = (change: RobotMapChange) => void;

export interface RobotMapInfo {
  readonly robotMapId: number;
  readonly name: string;
  readonly isCurrent: boolean;
}

export interface RobotMapIdentity {
  readonly robotMapId: number;
  readonly name: string | null;
}

interface HeldScene {
  readonly scene: VacuumScene;
  readonly version: string;
}

function subscribe<Listener>(
  table: Map<string, Set<Listener>>,
  deviceId: string,
  listener: Listener,
): () => void {
  const held = table.get(deviceId) ?? new Set<Listener>();
  held.add(listener);
  table.set(deviceId, held);
  return (): void => {
    held.delete(listener);
    if (held.size === 0 && table.get(deviceId) === held) table.delete(deviceId);
  };
}

export class XiaomiVacuumSource implements MapSource {
  readonly kind = 'xiaomi_vacuum';
  readonly label = 'Xiaomi vacuum';
  readonly capabilities: MapSourceCapabilities = HOME_MAP_VACUUM_CAPABILITIES;
  private readonly listeners = new Map<string, Set<MapSourceListener>>();
  private readonly mapListeners = new Map<string, Set<RobotMapListener>>();
  private readonly known = new Map<string, Map<number, string>>();
  private readonly pending = new Set<string>();

  constructor(private readonly ports: XiaomiVacuumSourcePorts) {}

  devicesOf(inventory: SourceInventory): string[] {
    return inventory
      .filter((device) => device.provider === 'xiaomi' && isVacuumModel(device.model))
      .map((device) => device.id);
  }

  read(deviceId: string): HomeMapSourceGeometry | null {
    const held = this.currentScene(deviceId);
    return held === null ? null : vacuumSceneToSourceGeometry(held.scene);
  }

  robotMaps(deviceId: string): readonly RobotMapInfo[] {
    return this.summaries(deviceId).map(({ robotMapId, name, isCurrent }) => ({
      robotMapId,
      name,
      isCurrent,
    }));
  }

  currentMap(deviceId: string): RobotMapIdentity | null {
    const robotMapId = this.currentRobotMapId(deviceId);
    if (robotMapId === null) return null;
    const listed = this.summaries(deviceId).find((entry) => entry.robotMapId === robotMapId);
    const scene = this.currentScene(deviceId)?.scene;
    const name = listed?.name ?? scene?.robotMapName ?? scene?.name ?? null;
    return { robotMapId, name: name === '' ? null : name };
  }

  readMap(deviceId: string, robotMapId: number): HomeMapSourceGeometry | null {
    const held = this.settledScene(deviceId, robotMapId);
    if (held === null) return null;
    return { ...vacuumSceneToSourceGeometry(held.scene), version: held.version };
  }

  isSettled(deviceId: string): boolean {
    const status = this.ports.value(deviceId, STATUS_KEY);
    const phase = status === undefined ? null : vacuumPhase({ vacuum_status: status });
    return isHomeMapVacuumSettled({ slot: 'current', phase });
  }

  onChange(deviceId: string, listener: MapSourceListener): () => void {
    return subscribe(this.listeners, deviceId, listener);
  }

  onMapChange(deviceId: string, listener: RobotMapListener): () => void {
    return subscribe(this.mapListeners, deviceId, listener);
  }

  published(deviceId: string, scene: VacuumScene): void {
    if (scene.slot !== 'current') return;
    const version = vacuumSceneVersion(scene);
    if (!this.isSettled(deviceId)) {
      this.pending.add(deviceId);
      this.ports.log.debug('home_map.source_pending', { deviceId, version });
      return;
    }
    this.pending.delete(deviceId);
    this.emit({ deviceId, version });
    if (scene.robotMapId !== undefined) this.emitMap(deviceId, scene.robotMapId);
  }

  savedMapsChanged(deviceId: string): void {
    const maps = this.summaries(deviceId);
    const held = this.known.get(deviceId) ?? new Map<number, string>();
    this.known.set(deviceId, new Map(maps.map((entry) => [entry.robotMapId, entry.version])));
    for (const entry of maps) {
      if (held.get(entry.robotMapId) === entry.version) continue;
      if (entry.isCurrent && !this.isSettled(deviceId)) {
        this.pending.add(deviceId);
        this.ports.log.debug('home_map.source_pending', {
          deviceId,
          robotMapId: entry.robotMapId,
          version: entry.version,
        });
      } else {
        this.emitMap(deviceId, entry.robotMapId);
      }
    }
  }

  statusChanged(deviceId: string): void {
    if (this.pending.has(deviceId) && this.isSettled(deviceId)) this.flush(deviceId);
  }

  cycleFinished(deviceId: string): void {
    if (this.pending.has(deviceId)) this.flush(deviceId);
  }

  detach(deviceId: string): void {
    this.pending.delete(deviceId);
    this.known.delete(deviceId);
    this.listeners.delete(deviceId);
    this.mapListeners.delete(deviceId);
  }

  private flush(deviceId: string): void {
    this.pending.delete(deviceId);
    const version = this.publishedVersion(deviceId);
    if (version === null) {
      this.ports.log.debug('home_map.source_pending_without_version', { deviceId });
    } else {
      this.emit({ deviceId, version });
    }
    const robotMapId = this.currentRobotMapId(deviceId);
    if (robotMapId !== null) this.emitMap(deviceId, robotMapId);
  }

  private publishedVersion(deviceId: string): string | null {
    const value = this.ports.value(deviceId, VACUUM_MAP_KEY);
    return typeof value === 'string' ? value : null;
  }

  private currentScene(deviceId: string): HeldScene | null {
    const published = this.publishedVersion(deviceId);
    if (published === null) return null;
    const scene = this.ports.scene(deviceId);
    if (scene === undefined || vacuumSceneVersion(scene) !== published) return null;
    return { scene, version: published };
  }

  private currentRobotMapId(deviceId: string): number | null {
    const listed = this.summaries(deviceId).find((entry) => entry.isCurrent);
    return listed?.robotMapId ?? this.currentScene(deviceId)?.scene.robotMapId ?? null;
  }

  private settledScene(deviceId: string, robotMapId: number): HeldScene | null {
    if (this.currentRobotMapId(deviceId) === robotMapId) {
      if (!this.isSettled(deviceId)) return null;
      const current = this.currentScene(deviceId);
      if (current?.scene.robotMapId === robotMapId) return current;
    }
    const saved = this.ports.robotMap(deviceId, robotMapId);
    if (saved === undefined) return null;
    return { scene: saved, version: vacuumSavedMapVersion({ index: saved.index, robotMapId }) };
  }

  private summaries(deviceId: string): readonly VacuumSavedMap[] {
    const value = this.ports.value(deviceId, VACUUM_SAVED_MAPS_KEY);
    if (typeof value !== 'string' || value === '') return [];
    try {
      const parsed = VACUUM_SAVED_MAPS.safeParse(JSON.parse(value));
      if (parsed.success) return parsed.data;
      this.ports.log.warn('home_map.saved_maps_unreadable', { deviceId });
    } catch (error) {
      this.ports.log.warn('home_map.saved_maps_unreadable', { deviceId, error: String(error) });
    }
    return [];
  }

  private emit(change: MapSourceChange): void {
    this.ports.log.info('home_map.source_settled', {
      deviceId: change.deviceId,
      version: change.version,
    });
    for (const listener of [...(this.listeners.get(change.deviceId) ?? [])]) {
      this.call(change.deviceId, () => {
        listener(change);
      });
    }
  }

  private emitMap(deviceId: string, robotMapId: number): void {
    const held = this.settledScene(deviceId, robotMapId);
    if (held === null) {
      this.ports.log.debug('home_map.source_map_not_ready', { deviceId, robotMapId });
      return;
    }
    const change: RobotMapChange = { deviceId, robotMapId, version: held.version };
    this.ports.log.info('home_map.source_map_settled', { ...change });
    for (const listener of [...(this.mapListeners.get(deviceId) ?? [])]) {
      this.call(deviceId, () => {
        listener(change);
      });
    }
  }

  private call(deviceId: string, work: () => void): void {
    try {
      work();
    } catch (error) {
      this.ports.log.error('home_map.source_listener_failed', { deviceId, error: String(error) });
    }
  }
}
