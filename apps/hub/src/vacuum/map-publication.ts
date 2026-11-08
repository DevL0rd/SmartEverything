import {
  VACUUM_MAP_KEY,
  VACUUM_POSE_KEY,
  VACUUM_SAVED_MAPS_KEY,
  vacuumSceneVersion,
  type DeviceEvent,
  type StateUpdate,
  type VacuumSavedMap,
  type VacuumScene,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { VACUUM_EVENT_FAMILY } from '@smarteverything/xiaomi';
import { z } from 'zod';
import type { LiveRouteUpdate } from './live-route';
import type { MapUnreadable } from './map-fetch';

export const NO_POSE_TEXT = '';

export const POSE_TEXT = z.strictObject({
  x: z.number(),
  y: z.number(),
  yaw: z.number(),
  cursor: z.number().int().nonnegative(),
});

export type PoseText = z.infer<typeof POSE_TEXT>;

export const MAP_UNREADABLE_NAME = 'map_unreadable';

export interface MapPublicationPorts {
  readonly state: (update: StateUpdate) => void;
  readonly event: (event: DeviceEvent) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

function mapSuffix(robotMapId: number | null): string {
  return robotMapId === null ? '' : `:${String(robotMapId)}`;
}

export function poseText(update: LiveRouteUpdate): string {
  const { pose, route } = update;
  if (pose === null) return NO_POSE_TEXT;
  return JSON.stringify({ x: pose.x, y: pose.y, yaw: pose.yaw, cursor: route.cursor });
}

export class VacuumMapPublication {
  constructor(private readonly ports: MapPublicationPorts) {}

  readonly published = (deviceId: string, scene: VacuumScene): void => {
    if (scene.slot !== 'current') return;
    const version = vacuumSceneVersion(scene);
    this.write(deviceId, VACUUM_MAP_KEY, version);
    this.ports.log.info('vacuum_map.published', { deviceId, version });
  };

  readonly savedMaps = (deviceId: string, maps: readonly VacuumSavedMap[]): void => {
    this.write(deviceId, VACUUM_SAVED_MAPS_KEY, JSON.stringify(maps));
    this.ports.log.info('vacuum_map.saved_maps_published', { deviceId, maps: maps.length });
  };

  readonly pose = (deviceId: string, update: LiveRouteUpdate): void => {
    this.write(deviceId, VACUUM_POSE_KEY, poseText(update));
  };

  readonly unreadable = (failure: MapUnreadable): void => {
    const occurredAt = this.ports.now().toISOString();
    this.ports.event({
      externalId: failure.deviceId,
      kind: 'activity',
      occurredAt,
      occurrence: `vacuum:${failure.deviceId}:map:${failure.slot}${mapSuffix(failure.robotMapId)}:${String(failure.index)}`,
      details: {
        family: VACUUM_EVENT_FAMILY,
        name: MAP_UNREADABLE_NAME,
        slot: failure.slot,
        index: failure.index,
        robotMapId: failure.robotMapId,
        stage: failure.stage,
        lastGoodIndex: failure.lastGood?.index ?? null,
        lastGoodAt: failure.lastGood?.fetchedAt ?? null,
      },
    });
    this.ports.log.warn('vacuum_map.unreadable_notice', {
      deviceId: failure.deviceId,
      slot: failure.slot,
      index: failure.index,
      stage: failure.stage,
    });
  };

  private write(deviceId: string, capability: StateUpdate['capability'], value: string): void {
    this.ports.state({
      externalId: deviceId,
      capability,
      value,
      observedAt: this.ports.now().toISOString(),
    });
  }
}
