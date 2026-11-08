import { describe, expect, it } from 'vitest';
import { createVisibilityRegistry } from '../live-visibility/registry';
import {
  bindStageDemand,
  mapDemandTargets,
  type MapDemandInput,
  type MapDemandPorts,
} from './use-map-demand';

const visible = { onScreen: true, screenFocused: true, stillReady: true };
const ROBOT = 'robot-1';
const SENSOR = 'sensor-1';

function fakePorts(): {
  readonly ports: MapDemandPorts;
  readonly registry: ReturnType<typeof createVisibilityRegistry>;
  readonly held: () => string[];
  readonly log: string[];
} {
  const registry = createVisibilityRegistry();
  const route = new Map<string, number>();
  const tracking = new Map<string, number>();
  const log: string[] = [];
  const lease =
    (table: Map<string, number>, kind: string) =>
    (id: string): (() => void) => {
      table.set(id, (table.get(id) ?? 0) + 1);
      log.push(`${kind}+${id}`);
      let open = true;
      return (): void => {
        if (!open) return;
        open = false;
        table.set(id, (table.get(id) ?? 1) - 1);
        log.push(`${kind}-${id}`);
      };
    };
  const ports: MapDemandPorts = {
    registry,
    holdRoute: lease(route, 'route'),
    acquireTracking: lease(tracking, 'track'),
  };
  const held = (): string[] => [
    ...[...route].filter(([, n]) => n > 0).map(([id, n]) => `route:${id}:${String(n)}`),
    ...[...tracking].filter(([, n]) => n > 0).map(([id, n]) => `track:${id}:${String(n)}`),
  ];
  return { ports, registry, held, log };
}

const hero: MapDemandInput = {
  stageId: 'hero',
  liveRobot: true,
  liveTracks: true,
  vacuumIds: [ROBOT],
  sensorIds: [SENSOR],
};

describe('map demand', () => {
  it('holds the route and tracking leases of a visible stage that draws both', () => {
    const { ports, registry, held } = fakePorts();
    registry.register('hero', visible);
    bindStageDemand(ports, 'hero', mapDemandTargets(hero));
    expect(held()).toEqual([`route:${ROBOT}:1`, `track:${SENSOR}:1`]);
  });

  it('holds nothing before the stage is visible and takes the leases the moment it becomes visible', () => {
    const { ports, registry, held } = fakePorts();
    registry.register('hero');
    bindStageDemand(ports, 'hero', mapDemandTargets(hero));
    expect(held()).toEqual([]);
    registry.report('hero', visible);
    expect(held()).toEqual([`route:${ROBOT}:1`, `track:${SENSOR}:1`]);
  });

  it('holds nothing while the stage is not registered, and follows its registration', () => {
    const { ports, registry, held } = fakePorts();
    bindStageDemand(ports, 'hero', mapDemandTargets(hero));
    expect(held()).toEqual([]);
    registry.register('hero', visible);
    expect(held()).toHaveLength(2);
  });

  it.each([
    ['screen blur', { screenFocused: false }],
    ['scroll out of view', { onScreen: false }],
    ['modal cover', { modalCovered: true }],
  ])('releases at once on %s and takes the leases again when visible', (_name, change) => {
    const { ports, registry, held } = fakePorts();
    registry.register('hero', visible);
    bindStageDemand(ports, 'hero', mapDemandTargets(hero));
    registry.report('hero', change);
    expect(held()).toEqual([]);
    registry.report('hero', { ...visible, modalCovered: false });
    expect(held()).toEqual([`route:${ROBOT}:1`, `track:${SENSOR}:1`]);
  });

  it('releases at once when the app goes to the background and restores in the foreground', () => {
    const { ports, registry, held } = fakePorts();
    registry.register('hero', visible);
    bindStageDemand(ports, 'hero', mapDemandTargets(hero));
    registry.setAppForeground(false);
    expect(held()).toEqual([]);
    registry.setAppForeground(true);
    expect(held()).toHaveLength(2);
  });

  it('releases on unmount and when the stage unregisters', () => {
    const { ports, registry, held } = fakePorts();
    const unregister = registry.register('hero', visible);
    const stop = bindStageDemand(ports, 'hero', mapDemandTargets(hero));
    unregister();
    expect(held()).toEqual([]);
    registry.register('hero', visible);
    expect(held()).toHaveLength(2);
    stop();
    expect(held()).toEqual([]);
    registry.report('hero', { onScreen: false });
    registry.report('hero', visible);
    expect(held()).toEqual([]);
  });

  it('draws only what the props ask for', () => {
    const { ports, registry, held } = fakePorts();
    registry.register('robot-only', visible);
    registry.register('tracks-only', visible);
    registry.register('plain', visible);
    bindStageDemand(ports, 'robot-only', mapDemandTargets({ ...hero, liveTracks: false }));
    expect(held()).toEqual([`route:${ROBOT}:1`]);
    bindStageDemand(ports, 'tracks-only', mapDemandTargets({ ...hero, liveRobot: false }));
    expect(held()).toEqual([`route:${ROBOT}:1`, `track:${SENSOR}:1`]);
    bindStageDemand(
      ports,
      'plain',
      mapDemandTargets({ ...hero, liveRobot: false, liveTracks: false }),
    );
    expect(held()).toHaveLength(2);
  });

  it.each([1, 2, 5, 20])('lets %i visible stages each hold the demand', (count) => {
    const { ports, registry, held } = fakePorts();
    for (let index = 0; index < count; index += 1) {
      const stageId = `stage-${String(index)}`;
      registry.register(stageId, visible);
      bindStageDemand(ports, stageId, mapDemandTargets({ ...hero, stageId }));
    }
    expect(held()).toEqual([`route:${ROBOT}:${String(count)}`, `track:${SENSOR}:${String(count)}`]);
    registry.setAppForeground(false);
    expect(held()).toEqual([]);
  });

  it('keeps the demand for a device while any other visible stage still draws it', () => {
    const { ports, registry, held } = fakePorts();
    registry.register('hero', visible);
    registry.register('pinned', visible);
    bindStageDemand(ports, 'hero', mapDemandTargets(hero));
    bindStageDemand(ports, 'pinned', mapDemandTargets({ ...hero, stageId: 'pinned' }));
    registry.report('hero', { onScreen: false });
    expect(held()).toEqual([`route:${ROBOT}:1`, `track:${SENSOR}:1`]);
  });

  it('takes each lease once per distinct device and never doubles on repeated visibility events', () => {
    const { ports, registry, held, log } = fakePorts();
    registry.register('hero', visible);
    bindStageDemand(
      ports,
      'hero',
      mapDemandTargets({ ...hero, vacuumIds: [ROBOT, ROBOT], sensorIds: [SENSOR, SENSOR] }),
    );
    registry.report('hero', { stillReady: false });
    registry.report('hero', { stillReady: true });
    expect(held()).toEqual([`route:${ROBOT}:1`, `track:${SENSOR}:1`]);
    expect(log).toEqual([`route+${ROBOT}`, `track+${SENSOR}`]);
  });
});
