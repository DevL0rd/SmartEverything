import { useMemo } from 'react';
import {
  HOME_MAP_PINNED_SIZE,
  type HomeMapLookPref,
  type HomeMapStageView,
  type HomeMapSummary,
  type HomeMapViewPref,
} from '@smarteverything/domain';
import type { SegmentedOption } from '../../../components/segmented';
import type { EntityStore } from '../../../store/entity-store';
import { PREFS, prefValueOf, savePref } from '../../../store/prefs';
import type { StoreState } from '../../../store/state';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';

export type StageViewChoice<V extends string> = SegmentedOption<V>;

export const DEFAULT_STAGE_VIEW: HomeMapStageView = '3d';

const PLAIN_VIEWS: readonly StageViewChoice<HomeMapStageView>[] = [
  { value: '3d', label: '3D', spoken: 'Show the map in 3D', icon: 'box' },
];

const SCANNED_VIEWS: readonly StageViewChoice<HomeMapStageView>[] = [
  ...PLAIN_VIEWS,
  { value: 'realistic', label: 'Realistic', spoken: 'Realistic view', icon: 'image' },
];

export type StageMapFacts = Pick<HomeMapSummary, 'hasScan'>;

export function stageViewsOf(
  map: StageMapFacts | null,
): readonly StageViewChoice<HomeMapStageView>[] {
  return map?.hasScan === true ? SCANNED_VIEWS : PLAIN_VIEWS;
}

export function shownStageView(
  remembered: HomeMapStageView | undefined,
  views: readonly StageViewChoice<HomeMapStageView>[],
): HomeMapStageView {
  return views.find((view) => view.value === remembered)?.value ?? DEFAULT_STAGE_VIEW;
}

export function rememberStageView(
  pref: HomeMapViewPref,
  page: string,
  view: HomeMapStageView,
): HomeMapViewPref {
  return { ...pref, view: { ...pref.view, [page]: view } };
}

const viewPrefOf = (state: StoreState): HomeMapViewPref => prefValueOf(state, PREFS.homeMapView);

function saveViewPref(store: EntityStore, patch: (pref: HomeMapViewPref) => HomeMapViewPref): void {
  savePref(store, PREFS.homeMapView, patch(viewPrefOf(store.get())));
}

export interface StageViews {
  readonly views: readonly StageViewChoice<HomeMapStageView>[];
  readonly view: HomeMapStageView;
  readonly setView: (view: HomeMapStageView) => void;
}

export function useStageViews(page: string, map: StageMapFacts | null): StageViews {
  const store = useEntityStore();
  const remembered = useStoreSelector((state) => viewPrefOf(state).view[page], Object.is, [page]);
  const views = stageViewsOf(map);
  const view = shownStageView(remembered, views);
  return useMemo(
    () => ({
      views,
      view,
      setView: (next: HomeMapStageView): void => {
        if (next === view) return;
        saveViewPref(store, (pref) => rememberStageView(pref, page, next));
      },
    }),
    [store, page, views, view],
  );
}

export interface StageLights {
  readonly on: boolean;
  readonly onToggle: () => void;
}

export function toggledLook(look: HomeMapLookPref): HomeMapLookPref {
  return { ...look, lightUp: !look.lightUp };
}

export function useStageLights(): StageLights {
  const store = useEntityStore();
  const on = useStoreSelector((state) => prefValueOf(state, PREFS.homeMapLook).lightUp);
  return useMemo(
    () => ({
      on,
      onToggle: (): void => {
        savePref(
          store,
          PREFS.homeMapLook,
          toggledLook(prefValueOf(store.get(), PREFS.homeMapLook)),
        );
      },
    }),
    [store, on],
  );
}

export function clampPinnedSize(size: number): number {
  return Math.min(HOME_MAP_PINNED_SIZE.max, Math.max(HOME_MAP_PINNED_SIZE.min, size));
}

export interface PinnedSplit {
  readonly size: number;
  readonly collapsed: boolean;
  readonly setSize: (size: number) => void;
  readonly setCollapsed: (collapsed: boolean) => void;
}

export function usePinnedSplit(): PinnedSplit {
  const store = useEntityStore();
  const size = useStoreSelector((state) => viewPrefOf(state).pinnedSize);
  const collapsed = useStoreSelector((state) => viewPrefOf(state).pinnedCollapsed);
  return useMemo(
    () => ({
      size,
      collapsed,
      setSize: (next: number): void => {
        saveViewPref(store, (pref) => ({
          ...pref,
          pinnedSize: clampPinnedSize(next),
          pinnedCollapsed: false,
        }));
      },
      setCollapsed: (next: boolean): void => {
        saveViewPref(store, (pref) => ({ ...pref, pinnedCollapsed: next }));
      },
    }),
    [store, size, collapsed],
  );
}

export interface LastFloor {
  readonly floorId: string | null;
  readonly setFloor: (floorId: string) => void;
}

export function useLastFloor(): LastFloor {
  const store = useEntityStore();
  const floorId = useStoreSelector((state) => viewPrefOf(state).lastFloor);
  return useMemo(
    () => ({
      floorId,
      setFloor: (next: string): void => {
        if (next === floorId) return;
        saveViewPref(store, (pref) => ({ ...pref, lastFloor: next }));
      },
    }),
    [store, floorId],
  );
}
