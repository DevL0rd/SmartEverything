import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createVisibilityRegistry,
  type VisibilityRegistry,
} from '../../../../components/house-map/live-visibility/registry';

interface Demand {
  readonly deviceId: string;
  readonly onScreen: boolean;
}

const demands = vi.hoisted(() => new Array<Demand>());

vi.mock('../data/map-demand', () => ({
  useVacuumMapDemand: (deviceId: string, onScreen: boolean): void => {
    demands.push({ deviceId, onScreen });
  },
}));

const { useVacuumRoute } = await import('./map-view-parts');

const ROBOT = 'robot';

const STAGE = 'home-map.vacuum-page.robot:page:r1';

interface ProbeProps {
  readonly registry: VisibilityRegistry;
  readonly stageId: string | null;
  readonly onScreen: boolean;
}

function Probe({ registry, stageId, onScreen }: ProbeProps): ReactNode {
  useVacuumRoute(ROBOT, { stageId, onScreen, registry });
  return null;
}

function held(props: ProbeProps): boolean {
  demands.length = 0;
  renderToStaticMarkup(createElement(Probe, props));
  return demands.at(-1)?.onScreen ?? false;
}

describe('vacuum live route gate', () => {
  it('holds the route only while the registered page stage is visible and focused', () => {
    const registry = createVisibilityRegistry();
    const page = { registry, stageId: STAGE, onScreen: true };
    const unregister = registry.register(STAGE);
    expect(held(page)).toBe(false);
    registry.report(STAGE, { onScreen: true, screenFocused: true });
    expect(held(page)).toBe(true);
    registry.report(STAGE, { screenFocused: false });
    expect(held(page)).toBe(false);
    registry.report(STAGE, { screenFocused: true, onScreen: false });
    expect(held(page)).toBe(false);
    unregister();
  });

  it('releases the route at once when the stage is covered, backgrounded or unregistered', () => {
    const registry = createVisibilityRegistry();
    const page = { registry, stageId: STAGE, onScreen: true };
    const unregister = registry.register(STAGE, { onScreen: true, screenFocused: true });
    expect(held(page)).toBe(true);
    registry.report(STAGE, { modalCovered: true });
    expect(held(page)).toBe(false);
    registry.report(STAGE, { modalCovered: false });
    expect(held(page)).toBe(true);
    registry.setAppForeground(false);
    expect(held(page)).toBe(false);
    registry.setAppForeground(true);
    expect(held(page)).toBe(true);
    unregister();
    expect(held(page)).toBe(false);
  });

  it('holds nothing for a stage that is on screen but not registered, such as the camera view', () => {
    const registry = createVisibilityRegistry();
    expect(held({ registry, stageId: STAGE, onScreen: true })).toBe(false);
    expect(demands.every((demand) => demand.deviceId === ROBOT)).toBe(true);
  });

  it('follows its own on screen state when no host registers it, as on a widget face', () => {
    const registry = createVisibilityRegistry();
    expect(held({ registry, stageId: null, onScreen: true })).toBe(true);
    expect(held({ registry, stageId: null, onScreen: false })).toBe(false);
  });
});
