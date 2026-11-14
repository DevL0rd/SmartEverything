import { useState } from 'react';
import type { PlaceCluster, LibraryBucket } from '@smarteverything/domain';
import type { FrameSize } from '../world-map/projection';
import { PHOTO_ALL, usePhotoBuckets, usePhotoClusters } from '../data';
import {
  boundsOf,
  clusterQueryOf,
  mapBoxOf,
  WORLD_START,
  zoomedInto,
  type MapBounds,
  type MapView,
} from './map-view';
import { fullRange, monthsOf, windowOf, type MonthRange } from './time-range';

const NO_MONTHS: readonly LibraryBucket[] = [];
const NO_CLUSTERS: readonly PlaceCluster[] = [];
const FIRST_FRAME: FrameSize = { width: 1, height: 1 };

export interface MapState {
  readonly view: MapView;
  readonly setView: (view: MapView) => void;
  readonly setFrame: (frame: FrameSize) => void;
  readonly months: readonly LibraryBucket[];
  readonly range: MonthRange;
  readonly setRange: (range: MonthRange) => void;
  readonly clusters: readonly PlaceCluster[];
  readonly selected: PlaceCluster | null;
  readonly select: (cluster: PlaceCluster | null) => void;
  readonly zoomInto: (cluster: PlaceCluster) => void;
  readonly bounds: MapBounds;
}

function useRange(
  months: readonly LibraryBucket[],
): readonly [MonthRange, (range: MonthRange) => void] {
  const [chosen, setChosen] = useState<MonthRange | null>(null);
  const full = fullRange(months);
  const range =
    chosen === null
      ? full
      : { start: Math.min(chosen.start, full.end), end: Math.min(chosen.end, full.end) };
  return [range, setChosen];
}

export function useMapState(enabled: boolean): MapState {
  const [view, setView] = useState<MapView>(WORLD_START);
  const [frame, setFrame] = useState<FrameSize | null>(null);
  const [selected, select] = useState<PlaceCluster | null>(null);
  const buckets = usePhotoBuckets(PHOTO_ALL).data;
  const months = buckets === undefined ? NO_MONTHS : monthsOf(buckets);
  const [range, setRange] = useRange(months);
  const query = clusterQueryOf(view, frame ?? FIRST_FRAME, windowOf(range, months));
  const clusters = usePhotoClusters(query, enabled && frame !== null).data ?? NO_CLUSTERS;
  const changeView = (next: MapView): void => {
    select(null);
    setView(next);
  };
  return {
    view,
    setView: changeView,
    setFrame: (next): void => {
      if (next.width !== frame?.width || next.height !== frame.height) setFrame(next);
    },
    months,
    range,
    setRange: (next): void => {
      select(null);
      setRange(next);
    },
    clusters,
    selected: clusters.find((cluster) => cluster.geohash === selected?.geohash) ?? null,
    select,
    zoomInto: (cluster): void => {
      changeView(zoomedInto(view, cluster));
    },
    bounds: boundsOf(mapBoxOf(view, frame ?? FIRST_FRAME)),
  };
}
