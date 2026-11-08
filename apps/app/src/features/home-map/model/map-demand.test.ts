import { describe, expect, it } from 'vitest';
import { createVisibilityRegistry } from '../../../components/house-map/live-visibility/registry';
import {
  bindStageDemand,
  mapDemandTargets,
} from '../../../components/house-map/live-demand/use-map-demand';
import { deviceFixture } from '../../../store/device-fixture';
import { stageDemand, stageIdOf } from '../components/stage/stage-states';
import { boardStagesOf, mapDemandFacts } from './map-demand';

describe('board stages', () => {
  it('gives the Home and Devices boards their own inline and full screen stage ids', () => {
    const ids = (['home', 'devices'] as const).flatMap((board) => {
      const stages = boardStagesOf(board);
      return [stageIdOf(stages.inline), stageIdOf(stages.full)];
    });
    expect(ids).toEqual([
      'home-map.home-hero',
      'home-map.home-full-screen',
      'home-map.devices-pinned',
      'home-map.devices-full-screen',
    ]);
  });
});

describe('home map live demand', () => {
  const vacuum = deviceFixture(1, { kind: 'vacuum' });
  const sensor = deviceFixture(2, { external_id: 'shelly-presence:radar-1' });
  const zone = deviceFixture(3, {
    external_id: 'shelly-presence:radar-1:201:0',
    parent_id: sensor.id,
  });
  const loose = deviceFixture(4, { kind: 'vacuum' });
  const map = {
    floors: [{ placements: [vacuum, sensor, zone].map((device) => ({ deviceId: device.id })) }],
  };
  const devices = [vacuum, sensor, zone, loose];
  const both = { showRobot: true, showPeople: true };

  it('asks for the placed robots and the placed physical presence sensors only', () => {
    expect(mapDemandFacts(map, devices, both)).toEqual({
      vacuumIds: [vacuum.id],
      sensorIds: ['shelly-presence:radar-1'],
      showRobot: true,
      showPeople: true,
    });
  });

  it('follows the robot and people settings', () => {
    const facts = mapDemandFacts(map, devices, { showRobot: false, showPeople: false });
    expect(mapDemandTargets(stageDemand({ kind: 'home-hero' }, facts))).toEqual({
      vacuumIds: [],
      sensorIds: [],
    });
    expect(mapDemandFacts(null, devices, both).vacuumIds).toEqual([]);
  });

  it('holds the route and tracking lease while the hero stage is live and releases at once', () => {
    const registry = createVisibilityRegistry();
    const log: string[] = [];
    const lease = (kind: string) => (id: string) => {
      log.push(`${kind}+${id}`);
      return (): void => {
        log.push(`${kind}-${id}`);
      };
    };
    const input = stageDemand({ kind: 'home-hero' }, mapDemandFacts(map, devices, both));
    const stop = bindStageDemand(
      { registry, holdRoute: lease('route'), acquireTracking: lease('track') },
      input.stageId,
      mapDemandTargets(input),
    );
    expect(log).toEqual([]);
    const id = stageIdOf({ kind: 'home-hero' });
    const unregister = registry.register(id, {
      onScreen: true,
      screenFocused: true,
      stillReady: true,
    });
    expect(log).toEqual([`route+${vacuum.id}`, 'track+shelly-presence:radar-1']);
    registry.report(id, { screenFocused: false });
    expect(log.slice(2)).toEqual([`route-${vacuum.id}`, 'track-shelly-presence:radar-1']);
    unregister();
    stop();
    expect(log).toHaveLength(4);
  });
});
