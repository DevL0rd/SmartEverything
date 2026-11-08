import { z } from 'zod';
import type { Ref } from 'react';
import type { DOMImperativeFactory, DOMProps } from 'expo/dom';
import type { VacuumFinish } from '@smarteverything/domain/vacuum-finish';
import type { HomeMapScan, HomeMapScanFormat } from '@smarteverything/domain';
import { HOME_MAP_OPENING_STATES } from '@smarteverything/domain/home-map-openings';
import { CLIMATE_TONES, climateText, climateTone } from '../climate-text';
import type { FloorLighting, LightPoolKind } from '../lighting';
import type { OverlayModel } from '../overlays/model-types';
import type { LiveOverlay } from './overlay-kit';
import type { ChromeBox } from '../stage-fit';
import type { SceneTheme } from './vacuum-geometry';
import type { CameraPresetId, ViewInsets } from './render-core-orbit';
import type {
  RenderFloor,
  RenderPoint,
  RenderPolygon,
  RenderPose,
  RenderTrailRun,
} from '../render-scene';
import { RENDER_SCENE_SOURCES } from './render-floor-wire';
import type { Map3dEditHandle } from './map-3d-edit-protocol';
import type { ObjectLook } from './render-core-objects';
import type { QualitySettings } from '../live-visibility/quality-scaler';

type WireMessage = DOMImperativeFactory[string];

export interface Map3dHandle extends ScanHandle, Map3dEditHandle {
  setScene: WireMessage;
  setPose: WireMessage;
  clearPose: WireMessage;
  setTrail: WireMessage;
  setModels: WireMessage;
  setLive: WireMessage;
}

export const SCENE_MESSAGE = z.tuple([z.string(), z.enum(RENDER_SCENE_SOURCES), z.string()]);

const POINT = z.strictObject({ x: z.number(), y: z.number() });

const RING = z.array(POINT);

const POLYGON = z.strictObject({ outer: RING, holes: z.array(RING) });

const POSE = z.strictObject({ x: z.number(), y: z.number(), yawDeg: z.number() });

const LIVE_OVERLAY = z.strictObject({
  zones: z.array(
    z.strictObject({ id: z.string(), occupied: z.boolean(), polygons: z.array(POLYGON) }),
  ),
  activeRooms: z.array(z.string()),
  motionDevices: z.array(z.string()),
  tracks: z.array(
    z.strictObject({
      deviceId: z.string(),
      id: z.string(),
      head: POINT,
      trail: z.array(z.strictObject({ x: z.number(), y: z.number(), opacity: z.number() })),
      ringM: z.number(),
    }),
  ),
  climate: z.array(
    z.strictObject({
      roomId: z.string(),
      at: POINT,
      heat: z.number().nullable(),
      text: z.string(),
      tone: z.enum(CLIMATE_TONES),
    }),
  ),
  openings: z.array(
    z.strictObject({
      id: z.string(),
      contact: z.enum(HOME_MAP_OPENING_STATES).nullable(),
      locked: z.boolean().nullable(),
    }),
  ),
  vacuum: z
    .strictObject({
      robot: POSE.nullable(),
      dock: POSE.nullable(),
      trail: z.array(z.strictObject({ mopping: z.boolean(), points: RING })),
    })
    .nullable(),
  cameras: z.array(
    z.strictObject({
      deviceId: z.string(),
      faint: z.boolean(),
      dashed: z.boolean(),
      view: z.strictObject({
        frustum: z.strictObject({ ring: RING, floorM: z.number(), topM: z.number() }),
      }),
    }),
  ),
  alerts: z.array(
    z.strictObject({ deviceId: z.string(), roomId: z.string().nullable(), pulse: z.boolean() }),
  ),
  badges: z.array(
    z.strictObject({ deviceId: z.string(), offline: z.boolean(), lowBattery: z.boolean() }),
  ),
});

const POOL_KINDS = ['ceiling', 'lamp', 'strip'] as const satisfies readonly LightPoolKind[];

const LIGHT_POOL = z.strictObject({
  deviceId: z.string(),
  roomId: z.string().nullable(),
  kind: z.enum(POOL_KINDS),
  from: POINT,
  to: POINT,
  reachM: z.number(),
  colour: z.string(),
  strength: z.number(),
  heightM: z.number(),
  clip: z.array(POLYGON),
});

const FLOOR_LIGHTING = z.strictObject({
  key: z.string(),
  enabled: z.boolean(),
  rooms: z.array(
    z.strictObject({
      id: z.string(),
      roomId: z.string().nullable(),
      name: z.string().nullable(),
      bounds: z.strictObject({
        minX: z.number(),
        minY: z.number(),
        maxX: z.number(),
        maxY: z.number(),
      }),
      pools: z.array(LIGHT_POOL),
    }),
  ),
  glows: z.array(
    z.strictObject({
      deviceId: z.string(),
      at: POINT,
      heightM: z.number(),
      colour: z.string(),
      strength: z.number(),
    }),
  ),
  dusk: z.strictObject({
    ambientScale: z.number(),
    sunScale: z.number(),
    tint: z.string(),
    veilOpacity: z.number(),
  }),
});

export interface LiveWire {
  readonly overlay: LiveOverlay;
  readonly lighting: FloorLighting;
}

export const LIVE_WIRE: z.ZodType<LiveWire> = z.strictObject({
  overlay: LIVE_OVERLAY,
  lighting: FLOOR_LIGHTING,
});

const pointOf = ({ x, y }: RenderPoint): RenderPoint => ({ x, y });

const ringOf = (ring: readonly RenderPoint[]): RenderPoint[] => ring.map(pointOf);

const polygonOf = (polygon: RenderPolygon): RenderPolygon => ({
  outer: ringOf(polygon.outer),
  holes: polygon.holes.map(ringOf),
});

const poseOf = (pose: RenderPose | null): RenderPose | null =>
  pose === null ? null : { x: pose.x, y: pose.y, yawDeg: pose.yawDeg };

function vacuumOf(vacuum: OverlayModel['vacuum']): LiveOverlay['vacuum'] {
  if (vacuum === null) return null;
  return {
    robot: poseOf(vacuum.robot),
    dock: poseOf(vacuum.dock),
    trail: vacuum.trail.map((run) => ({ mopping: run.mopping, points: ringOf(run.points) })),
  };
}

export function liveOverlayOf(model: OverlayModel): LiveOverlay {
  return {
    zones: model.zones.map(({ id, occupied, polygons }) => ({
      id,
      occupied,
      polygons: polygons.map(polygonOf),
    })),
    activeRooms: model.activeRooms,
    motionDevices: model.motionDevices,
    tracks: model.tracks.map(({ deviceId, id, head, trail, ringM }) => ({
      ...{ deviceId, id, head: pointOf(head), ringM },
      trail: trail.map(({ x, y, opacity }) => ({ x, y, opacity })),
    })),
    climate: model.climate.map((chip) => ({
      ...{ roomId: chip.roomId, at: pointOf(chip.at), heat: chip.heat },
      ...{ text: climateText(chip), tone: climateTone(chip) },
    })),
    openings: model.openings.map(({ id, contact, locked }) => ({ id, contact, locked })),
    vacuum: vacuumOf(model.vacuum),
    cameras: model.cameras.map(({ deviceId, faint, dashed, view }) => {
      const { ring, floorM, topM } = view.frustum;
      return { deviceId, faint, dashed, view: { frustum: { ring: ringOf(ring), floorM, topM } } };
    }),
    alerts: model.alerts.map(({ deviceId, roomId, pulse }) => ({ deviceId, roomId, pulse })),
    badges: model.badges.map(({ deviceId, offline, lowBattery }) => ({
      ...{ deviceId, offline, lowBattery },
    })),
  };
}

export interface ShownTrail {
  readonly base: readonly RenderTrailRun[];
  readonly live: readonly RenderTrailRun[];
}

export type Map3dFailure = 'webgl' | 'scene';

export interface Map3dDomProps {
  readonly ref: Ref<Map3dHandle>;
  readonly theme: SceneTheme;
  readonly finish: VacuumFinish;
  readonly preset: CameraPresetId;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  readonly fitSeq: number;
  readonly follow: boolean;
  readonly selection: readonly string[];
  readonly frameRooms?: readonly string[];
  readonly currentRoomId: string | null;
  readonly selectedItem?: string | null;
  readonly quality?: QualitySettings;
  readonly realistic?: boolean;
  readonly objectLook?: ObjectLook;
  readonly keepOut: readonly ChromeBox[];
  readonly insets: ViewInsets;
  readonly label: string;
  readonly onReady: () => Promise<void>;
  readonly onPickRoom: (roomId: string | null) => Promise<void>;
  readonly onPickDevice?: (deviceId: string) => Promise<void>;
  readonly onUnavailable: (failure: Map3dFailure, detail: string) => Promise<void>;
  readonly onFrameTime?: (frameMs: number) => Promise<void>;
  readonly onScanFailed?: (detail: string) => Promise<void>;
  readonly onEdit?: (json: string) => Promise<void>;
  readonly editing?: boolean;
  readonly dom?: DOMProps;
}

export interface ScanHandle extends DOMImperativeFactory {
  setScan: WireMessage;
  clearScan: WireMessage;
  setScanPlacement: WireMessage;
  setScanBand: WireMessage;
  clearScanBand: WireMessage;
}

export type ScanFileVariant = 'original' | 'lod';

export interface ScanSource {
  readonly key: string;
  readonly url: string;
  readonly format: HomeMapScanFormat;
}

export interface ScanPlacementWire {
  readonly tx: number;
  readonly ty: number;
  readonly tz: number;
  readonly yawDeg: number;
  readonly scale: number;
  readonly opacity: number;
}

export interface ScanBand {
  readonly bottom: number;
  readonly top: number;
}

export type ScanUrlOf = (mapId: string, variant: ScanFileVariant) => string;

export function scanSourceOf(
  mapId: string,
  scan: HomeMapScan | null,
  urlOf: ScanUrlOf,
): ScanSource | null {
  if (scan === null) return null;
  if (scan.lod !== null) {
    return { key: `${mapId}:lod:${scan.lod.hash}`, url: urlOf(mapId, 'lod'), format: 'rad' };
  }
  const { hash, format } = scan.file;
  return { key: `${mapId}:original:${hash}`, url: urlOf(mapId, 'original'), format };
}

export function scanBandOf(floor: Pick<RenderFloor, 'elevation' | 'ceilingHeight'>): ScanBand {
  return { bottom: floor.elevation, top: floor.elevation + floor.ceilingHeight };
}

export function scanPlacementOf(scan: HomeMapScan): ScanPlacementWire {
  const { tx, ty, tz, yawDeg, scale } = scan.transform;
  return { tx, ty, tz, yawDeg, scale, opacity: scan.opacity };
}

function samePlacement(left: ScanPlacementWire | null, right: ScanPlacementWire | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.tx === right.tx &&
    left.ty === right.ty &&
    left.tz === right.tz &&
    left.yawDeg === right.yawDeg &&
    left.scale === right.scale &&
    left.opacity === right.opacity
  );
}

function sameBand(left: ScanBand | null, right: ScanBand | null): boolean {
  if (left === null || right === null) return left === right;
  return left.bottom === right.bottom && left.top === right.top;
}

export class ScanSender {
  private connected = false;
  private source: ScanSource | null = null;
  private placement: ScanPlacementWire | null = null;
  private band: ScanBand | null = null;
  private sentKey: string | null = null;
  private sentPlacement: ScanPlacementWire | null = null;
  private sentBand: ScanBand | null = null;

  constructor(private readonly target: () => ScanHandle | null) {}

  ready(): void {
    this.connected = true;
    this.sentKey = null;
    this.sentPlacement = null;
    this.sentBand = null;
    this.flush();
  }

  lost(): void {
    this.connected = false;
  }

  show(source: ScanSource | null, placement: ScanPlacementWire | null): void {
    this.source = source;
    this.placement = source === null ? null : placement;
    this.flush();
  }

  setBand(band: ScanBand | null): void {
    this.band = band;
    this.flush();
  }

  retry(): void {
    this.sentKey = null;
    this.flush();
  }

  private flush(): void {
    const handle = this.connected ? this.target() : null;
    if (handle === null) return;
    this.flushSource(handle);
    this.flushPlacement(handle);
    this.flushBand(handle);
  }

  private flushSource(handle: ScanHandle): void {
    const key = this.source?.key ?? null;
    if (key === this.sentKey) return;
    if (this.source === null) handle.clearScan();
    else handle.setScan(this.source.key, this.source.url, this.source.format);
    this.sentKey = key;
  }

  private flushPlacement(handle: ScanHandle): void {
    if (this.placement === null || samePlacement(this.placement, this.sentPlacement)) return;
    const { tx, ty, tz, yawDeg, scale, opacity } = this.placement;
    handle.setScanPlacement(tx, ty, tz, yawDeg, scale, opacity);
    this.sentPlacement = this.placement;
  }

  private flushBand(handle: ScanHandle): void {
    if (sameBand(this.band, this.sentBand)) return;
    if (this.band === null) handle.clearScanBand();
    else handle.setScanBand(this.band.bottom, this.band.top);
    this.sentBand = this.band;
  }
}
