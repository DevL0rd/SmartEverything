import { useEffect } from 'react';
import { Logger } from '@smarteverything/logging';
import type { VisibilityRegistry } from '../live-visibility/registry';

const log = new Logger('app.house-map');

export interface MapDemandPorts {
  readonly registry: Pick<VisibilityRegistry, 'getStage' | 'subscribeStage'>;
  readonly holdRoute: (deviceId: string) => () => void;
  readonly acquireTracking: (externalId: string) => () => void;
}

export interface MapDemandInput {
  readonly stageId: string;
  readonly liveRobot: boolean;
  readonly liveTracks: boolean;
  readonly vacuumIds: readonly string[];
  readonly sensorIds: readonly string[];
}

export interface MapDemandTargets {
  readonly vacuumIds: readonly string[];
  readonly sensorIds: readonly string[];
}

export function mapDemandTargets(input: MapDemandInput): MapDemandTargets {
  return {
    vacuumIds: input.liveRobot ? [...new Set(input.vacuumIds)] : [],
    sensorIds: input.liveTracks ? [...new Set(input.sensorIds)] : [],
  };
}

export function bindStageDemand(
  ports: MapDemandPorts,
  stageId: string,
  targets: MapDemandTargets,
): () => void {
  let releases: readonly (() => void)[] = [];

  const releaseAll = (): void => {
    const held = releases;
    releases = [];
    for (const release of held) {
      release();
    }
    if (held.length > 0) {
      log.debug('map_demand.released', { stageId, leases: held.length });
    }
  };

  const acquireAll = (): void => {
    releases = [
      ...targets.vacuumIds.map((id) => ports.holdRoute(id)),
      ...targets.sensorIds.map((id) => ports.acquireTracking(id)),
    ];
    if (releases.length > 0) {
      log.debug('map_demand.held', { stageId, leases: releases.length });
    }
  };

  const follow = (): void => {
    const live = ports.registry.getStage(stageId).live;
    if (live && releases.length === 0) {
      acquireAll();
    } else if (!live) {
      releaseAll();
    }
  };

  const unsubscribe = ports.registry.subscribeStage(stageId, follow);
  follow();
  return (): void => {
    unsubscribe();
    releaseAll();
  };
}

export function useMapDemand(input: MapDemandInput, ports: MapDemandPorts): void {
  const targets = mapDemandTargets(input);
  const vacuumKey = [...targets.vacuumIds].sort().join(',');
  const sensorKey = [...targets.sensorIds].sort().join(',');
  const { stageId } = input;
  useEffect(() => {
    const wanted: MapDemandTargets = {
      vacuumIds: vacuumKey === '' ? [] : vacuumKey.split(','),
      sensorIds: sensorKey === '' ? [] : sensorKey.split(','),
    };
    if (wanted.vacuumIds.length === 0 && wanted.sensorIds.length === 0) {
      return undefined;
    }
    return bindStageDemand(ports, stageId, wanted);
  }, [ports, stageId, vacuumKey, sensorKey]);
}
