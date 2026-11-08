import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyArea, ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { Segmented } from '../../components/segmented';
import { Text } from '../../components/text';
import type { EditEvent } from '../../components/house-map/3d/map-3d-edit-protocol';
import type { CameraPresetId } from '../../components/house-map/3d/render-core-orbit';
import { boundsOfPoints, mergeBounds } from '../../components/house-map/render-scene';
import type { EditSettled } from '../../features/home-map/components/stage/home-map-3d';
import { Stage, type StageContent } from '../../features/home-map/components/stage/stage';
import type { StageViewOption } from '../../features/home-map/components/stage/stage-chrome';
import { StageStillView } from '../../features/home-map/components/stage/stage-states';
import type { EditorNotice } from '../../features/home-map/editor/mount-edit';
import { StageNoticeChip } from '../../features/home-map/editor/stage-notice';
import { useDevices } from '../../store/selectors';
import {
  areaCells,
  commitStroke,
  strokeRejected,
  toolStroke,
  type PainterTool,
} from './area-context';
import type { GridCell } from './area-geometry';
import {
  areaRings,
  fitRoomArea,
  gridRange,
  houseCell,
  houseEdge,
  resizeSegment,
  segmentCornerOf,
  zoneFrame,
  zoneOverlay,
} from './map-zone-model';
import { ZoneScene, type MapZoneProps, type ZoneEdit } from './map-zone-marks';
import { useSensorView, type SensorMapView } from './presence-map';
import { SensorStill, useSensorScene, type SensorScene } from './presence-stage';

type MapTool = Exclude<PainterTool, 'select'>;

const TOOLS = [
  { value: 'paint', label: 'Paint', icon: 'pencil' },
  { value: 'erase', label: 'Erase', icon: 'minus' },
] as const;

const NO_VIEWS: readonly StageViewOption<'3d'>[] = [];

const STILL_STATE = { unavailable: false } as const;

export function useSensorMapView(sensor: ShellyDevice): SensorMapView | null {
  const devices = useDevices({ includeHidden: true });
  const deviceId = devices.find((device) => device.external_id === sensor.externalId)?.id ?? null;
  return useSensorView(sensor, deviceId);
}

interface History {
  readonly past: readonly ShellyArea[];
  readonly future: readonly ShellyArea[];
}

interface Painting {
  readonly tool: MapTool;
  readonly pending: GridCell | null;
  readonly rejected: boolean;
  readonly commit: (next: ShellyArea) => void;
  readonly setTool: (tool: MapTool) => void;
  readonly setPending: (pending: GridCell | null) => void;
  readonly setRejected: (rejected: boolean) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

function usePainting(area: ShellyArea, change: (area: ShellyArea) => void): Painting {
  const [tool, setTool] = useState<MapTool>('paint');
  const [pending, setPending] = useState<GridCell | null>(null);
  const [rejected, setRejected] = useState(false);
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const previous = history.past.at(-1);
  const following = history.future.at(-1);
  return {
    ...{ tool, pending, rejected, setPending, setRejected },
    setTool: (next): void => {
      setPending(null);
      setTool(next);
    },
    commit: (next): void => {
      setHistory({ past: [...history.past, area], future: [] });
      change(next);
    },
    canUndo: previous !== undefined,
    canRedo: following !== undefined,
    undo: (): void => {
      if (previous === undefined) return;
      setHistory({ past: history.past.slice(0, -1), future: [...history.future, area] });
      change(previous);
    },
    redo: (): void => {
      if (following === undefined) return;
      setHistory({ past: [...history.past, area], future: history.future.slice(0, -1) });
      change(following);
    },
  };
}

function tapCell(zone: MapZoneProps, painting: Painting, cell: GridCell): void {
  painting.setRejected(false);
  if (painting.pending === null) {
    painting.setPending(cell);
    return;
  }
  const strokes = toolStroke(painting.tool, painting.pending, cell, zone.allowed);
  painting.setPending(null);
  painting.setRejected(strokeRejected(painting.tool, strokes));
  if (strokes.length > 0) painting.commit(commitStroke(zone.area, painting.tool, strokes));
}

type VertexEvent = Extract<EditEvent, { readonly type: 'vertex' }>;

function resizedArea(zone: MapZoneProps, event: VertexEvent): ShellyArea | null {
  const at = segmentCornerOf(zone.area, event.handleId);
  if (at === null) return null;
  return resizeSegment(zone.area, at, houseEdge(zone.view.spot.pose, event.point), zone.allowed);
}

interface ZoneEvents {
  readonly committed: number | null;
  readonly settled: EditSettled | null;
  readonly onEvent: (event: EditEvent) => void;
}

function useZoneEvents(zone: MapZoneProps, painting: Painting): ZoneEvents {
  const [committed, setCommitted] = useState<number | null>(null);
  const [settled, setSettled] = useState<EditSettled | null>(null);
  const onEvent = (event: EditEvent): void => {
    if (event.type === 'tap') tapCell(zone, painting, houseCell(zone.view.spot.pose, event.point));
    if (event.type !== 'vertex') return;
    const next = resizedArea(zone, event);
    if (next === null) {
      setSettled({ seq: event.seq, accepted: false });
      return;
    }
    painting.commit(next);
    setCommitted(event.seq);
  };
  return { committed, settled, onEvent };
}

function useFrameBounds(view: SensorMapView, area: ShellyArea): SensorMapView['bounds'] {
  const [first] = useState(area);
  return useMemo(
    () =>
      mergeBounds([view.bounds, boundsOfPoints(areaRings(view.spot.pose, first).flat())]) ??
      view.bounds,
    [view.bounds, view.spot.pose, first],
  );
}

function useZoneOverlay(zone: MapZoneProps, painting: Painting): ZoneEdit['overlay'] {
  const { view, sensor, area, context, allowed } = zone;
  const { pose, room, placement } = view.spot;
  const position = sensor.config?.sensor?.position;
  const bounds = useFrameBounds(view, area);
  const { pending, tool } = painting;
  return useMemo(() => {
    const rings = room?.polygons.map((polygon) => polygon.outer) ?? [];
    return zoneOverlay({
      ...{ pose, area, context, allowed },
      grid: gridRange(pose, position, area, rings),
      pending: pending === null ? null : { cell: pending, erase: tool === 'erase' },
      frame: zoneFrame(`presence-zones:${placement.deviceId}`, bounds),
    });
  }, [pose, area, context, allowed, room, position, pending, tool, placement.deviceId, bounds]);
}

export function zoneNotice(tool: MapTool, pending: GridCell | null): EditorNotice {
  if (pending !== null) return { text: 'Tap the opposite corner', tone: 'info' };
  return { text: `Tap a corner of the cells to ${tool}`, tone: 'info' };
}

interface StageProps {
  readonly zone: MapZoneProps;
  readonly painting: Painting;
  readonly scene: SensorScene | null;
  readonly onUnavailable: () => void;
}

function zoneContent(props: StageProps, edit: ZoneEdit, label: string): StageContent {
  const { zone, scene } = props;
  const { floor, placement } = zone.view.spot;
  return {
    kind: 'live',
    id: `home-map.shelly-zones.${placement.deviceId}`,
    still: <StageStillView input={{ floor }} name={label} state={STILL_STATE} />,
    render: (context, live) =>
      scene === null ? (
        <SensorStill floor={floor} name={label} unavailable={false} live={live} />
      ) : (
        <ZoneScene {...{ view: zone.view, scene, edit, label, context, live }} />
      ),
  };
}

function ZoneStage(props: StageProps): ReactNode {
  const { zone, painting } = props;
  const [preset, setPreset] = useState<CameraPresetId>('top');
  const events = useZoneEvents(zone, painting);
  const overlay = useZoneOverlay(zone, painting);
  const edit: ZoneEdit = { ...events, overlay, onUnavailable: props.onUnavailable };
  const label = `Zone cells on the home map, ${String(areaCells(zone.area))} cells painted`;
  return (
    <Stage
      variant="page"
      className="border-hairline border-outline-variant"
      summary={label}
      content={zoneContent(props, edit, label)}
      views={NO_VIEWS}
      view="3d"
      onViewChange={(): void => undefined}
      tools={{ tools3d: true }}
      camera={{ preset, onPreset: setPreset }}
      notices={<StageNoticeChip notice={zoneNotice(painting.tool, painting.pending)} />}
    />
  );
}

function MapTools({
  zone,
  painting,
}: {
  readonly zone: MapZoneProps;
  readonly painting: Painting;
}): ReactNode {
  const { room, pose } = zone.view.spot;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Segmented
        label="Map painting tool"
        options={TOOLS}
        value={painting.tool}
        onChange={painting.setTool}
      />
      <Button
        label="Undo"
        icon="undo"
        variant="text"
        disabled={!painting.canUndo}
        onPress={painting.undo}
      />
      <Button label="Redo" variant="text" disabled={!painting.canRedo} onPress={painting.redo} />
      {!zone.roomArea || room === null ? null : (
        <Button
          label="Fit the sensor room to this room"
          icon="grid"
          variant="tonal"
          onPress={() => {
            painting.commit(fitRoomArea(pose, room.polygons));
          }}
        />
      )}
    </View>
  );
}

export function MapZoneEditor(zone: MapZoneProps): ReactNode {
  const painting = usePainting(zone.area, zone.change);
  const scene = useSensorScene(zone.view);
  const [unavailable, setUnavailable] = useState(false);
  const cells = areaCells(zone.area);
  return (
    <View className="gap-3">
      {unavailable ? (
        <Text tone="variant">
          The 3D map is not available on this device. Paint the zone on the sensor grid.
        </Text>
      ) : (
        <MapTools zone={zone} painting={painting} />
      )}
      <ZoneStage
        {...{ zone, painting, scene }}
        onUnavailable={(): void => {
          setUnavailable(true);
        }}
      />
      {painting.rejected ? (
        <Text tone="critical">Paint inside the main room. That stroke was outside it.</Text>
      ) : null}
      <Text variant="caption" tone="variant">
        {String(cells)} cells · {String(cells * 0.25)} m² · 0.5 m sensor cells turned with the
        sensor. Tap two corners to paint, drag a corner knob to resize.
      </Text>
    </View>
  );
}
