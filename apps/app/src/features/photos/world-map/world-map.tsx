import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PlaceCluster } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { Zoomable } from '../../../components/zoomable';
import { cn } from '../../../design/cn';
import { ClusterMarker } from './cluster-marker';
import { clusterMarks } from './clusters';
import { countryShades, type CountryCount } from './countries';
import { fitOf, WORLD_VIEW, type FrameSize } from './projection';
import { useMapFrame } from './use-map-frame';
import { WorldBase } from './world-base';

interface WorldMapBase {
  readonly label: string;
  readonly attribution: string;
  readonly onZoomed?: ((zoomed: boolean) => void) | undefined;
  readonly className?: string | undefined;
}

export interface ClusterMapProps extends WorldMapBase {
  readonly mode: 'clusters';
  readonly clusters: readonly PlaceCluster[];
  readonly selected: string | null;
  readonly onSelect: (cluster: PlaceCluster) => void;
}

export interface CountryMapProps extends WorldMapBase {
  readonly mode: 'countries';
  readonly countries: readonly CountryCount[];
}

export type WorldMapProps = ClusterMapProps | CountryMapProps;

function Clusters({
  map,
  frame,
}: {
  readonly map: ClusterMapProps;
  readonly frame: FrameSize;
}): ReactNode {
  return clusterMarks(map.clusters, fitOf(WORLD_VIEW, frame)).map((mark) => (
    <ClusterMarker
      key={mark.cluster.geohash}
      mark={mark}
      selected={mark.cluster.geohash === map.selected}
      onSelect={map.onSelect}
    />
  ));
}

function Layers({
  map,
  frame,
}: {
  readonly map: WorldMapProps;
  readonly frame: FrameSize;
}): ReactNode {
  const shades = map.mode === 'countries' ? countryShades(map.countries) : undefined;
  return (
    <Zoomable onZoomed={map.onZoomed}>
      <View accessible accessibilityRole="image" accessibilityLabel={map.label}>
        <WorldBase view={WORLD_VIEW} frame={frame} shades={shades} />
      </View>
      {map.mode === 'clusters' ? <Clusters map={map} frame={frame} /> : null}
    </Zoomable>
  );
}

export function WorldMap(props: WorldMapProps): ReactNode {
  const { ref, frame, onLayout } = useMapFrame();
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      className={cn('overflow-hidden bg-surface-1', props.className)}
    >
      {frame === null ? null : <Layers map={props} frame={frame} />}
      <View pointerEvents="none" className="absolute bottom-2 left-3">
        <Text variant="caption" tone="variant">
          {props.attribution}
        </Text>
      </View>
    </View>
  );
}
