import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP_SUMMARY, type HomeMapSummary } from '@smarteverything/domain';

const shown = vi.hoisted(() => new Array<string>());

const none = (): null => null;

vi.mock('expo-router', () => ({ useRouter: (): { push: () => void } => ({ push: none }) }));
vi.mock('./pinned-body', () => ({ PinnedBody: none }));
vi.mock('../../home-map/components/stage/full-screen', () => ({ StageFullScreen: none }));
vi.mock('../../home-map/model/stage-view', () => ({
  useLastFloor: (): { floorId: null; setFloor: () => void } => ({ floorId: null, setFloor: none }),
  useStageLights: (): { on: boolean; onToggle: () => void } => ({ on: true, onToggle: none }),
  useStageViews: (): { views: []; view: string; setView: () => void } => ({
    views: [],
    view: '3d',
    setView: none,
  }),
}));
vi.mock('../../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: none,
}));
vi.mock('../../../store/selectors', () => ({
  useDevices: (): [] => [],
  useRooms: (): [] => [],
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));
vi.mock('../../home-map/components/stage/stage', () => ({ Stage: none }));
vi.mock('../../home-map/components/stage/stage-states', () => ({
  EmptyFloorRow: none,
  StageStillView: none,
  stageIdOf: none,
  StageSkeleton: (): null => {
    shown.push('skeleton');
    return null;
  },
  stageDimmed: none,
  stageNotices: (): [] => [],
  stageNoticesNode: none,
  stagePhase: (): string => 'skeleton',
}));
vi.mock('../../home-map/data/home-map-query', () => ({
  useHomeMap: (): { map: null; loading: boolean; failure: null; retry: () => void } => {
    shown.push('stage');
    return { map: null, loading: true, failure: null, retry: none };
  },
}));
vi.mock('../../home-map/data/map-set-query', () => ({ useHomeMapSet: none }));
vi.mock('../../home-map/model/map-choice', () => ({ useMapChoice: none }));
vi.mock('../../home-map/data/map-demand', () => ({ useHomeMapDemand: none }));
vi.mock('../../home-map/data/stage-maps', () => ({ useStageMaps: (): undefined => undefined }));
vi.mock('../../../store/store-context', () => ({ useStoreSelector: (): object => ({}) }));

const { PinnedMap, pinnedChoiceOf } = await import('./pinned-map');

function summary(roomCount: number): HomeMapSummary {
  return HOME_MAP_SUMMARY.parse({
    id: 'cabin',
    name: 'Cabin',
    revision: 1,
    floorNames: ['Ground'],
    roomCount,
    isDefault: true,
    position: 0,
    fedBy: [],
    hasScan: false,
    updatedAt: '2026-10-25T00:00:00.000Z',
  });
}

describe('pinned map choice', () => {
  it('waits while the maps are read, then offers Create a map for the default map', () => {
    expect(pinnedChoiceOf(null, false)).toEqual({ kind: 'loading' });
    expect(pinnedChoiceOf(null, true)).toEqual({ kind: 'blank', map: null });
  });

  it('offers Create a map for a chosen map with no rooms and pins a drawn one', () => {
    const blank = summary(0);
    const drawn = summary(4);
    expect(pinnedChoiceOf(blank, true)).toEqual({ kind: 'blank', map: blank });
    expect(pinnedChoiceOf(drawn, false)).toEqual({ kind: 'map', map: drawn });
  });

  it('draws the loading stage until a map is known', () => {
    const props = { focus: { kind: 'none' as const }, onSelect: none };
    shown.length = 0;
    renderToStaticMarkup(createElement(PinnedMap, { ...props, summary: null }));
    expect(shown).toEqual(['skeleton']);
    shown.length = 0;
    renderToStaticMarkup(createElement(PinnedMap, { ...props, summary: summary(2) }));
    expect(shown).toContain('stage');
  });
});
