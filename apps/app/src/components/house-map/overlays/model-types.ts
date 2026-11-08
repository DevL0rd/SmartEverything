import type {
  HomeMapCameraView,
  HomeMapPolygonShape,
  HomeMapPtzState,
  ShellyHouseSegment,
} from '@smarteverything/domain';
import type { StatusTone } from '../../tone';
import type { RenderFloor, RenderPoint, RenderPose, RenderTrailRun } from '../render-scene';

export const TRACK_TRAIL_MS = 10_000;

export const OPENING_OPEN_LEAF_DEG = 70;

export const HEAT_TINT_RANGE_C = { cold: 16, warm: 28 } as const;

export const CAMERA_DIRECTION_UNKNOWN_TEXT = 'Direction unknown since the last move';

export type OverlayAlertKind = 'leak' | 'smoke' | 'gas';

export interface OverlayDeviceState {
  readonly online: boolean;
  readonly model?: string | null;
  readonly batteryLow?: boolean | null;
  readonly contactOpen?: boolean | null;
  readonly locked?: boolean | null;
  readonly occupied?: boolean | null;
  readonly motion?: boolean | null;
  readonly alert?: OverlayAlertKind | null;
  readonly ptz?: HomeMapPtzState;
}

export interface OverlayReading {
  readonly amount: number;
  readonly value: string;
  readonly unit: string | null;
  readonly verdict: string;
  readonly tone: StatusTone;
  readonly stale: boolean;
}

export interface OverlayRoomClimate {
  readonly temperature: OverlayReading | null;
  readonly pm25: OverlayReading | null;
}

export interface OverlayTrackPoint extends RenderPoint {
  readonly at: number;
}

export interface OverlayTrack {
  readonly id: string;
  readonly points: readonly OverlayTrackPoint[];
}

export interface OverlayZone {
  readonly id: string;
  readonly area: readonly ShellyHouseSegment[];
  readonly occupied: boolean;
}

export interface OverlaySensor {
  readonly deviceId: string;
  readonly zones: readonly OverlayZone[];
  readonly tracks: readonly OverlayTrack[];
}

export interface OverlayTransform {
  readonly rotationDeg: number;
  readonly tx: number;
  readonly ty: number;
  readonly mirrored: boolean;
}

export interface OverlayVacuumInput {
  readonly transform: OverlayTransform;
  readonly working: boolean;
  readonly robot: RenderPose | null;
  readonly dock: RenderPose | null;
  readonly trail: readonly RenderTrailRun[];
}

export interface OverlayInput {
  readonly floor: RenderFloor;
  readonly now: number;
  readonly devices: ReadonlyMap<string, OverlayDeviceState>;
  readonly climate: ReadonlyMap<string, OverlayRoomClimate>;
  readonly sensors: readonly OverlaySensor[];
  readonly trackingLease: boolean;
  readonly vacuum: OverlayVacuumInput | null;
  readonly selectedDeviceId: string | null;
  readonly showAllCameraViews: boolean;
  readonly heatTint: boolean;
  readonly animate: boolean;
}

export interface OverlayZoneFill {
  readonly id: string;
  readonly deviceId: string;
  readonly occupied: boolean;
  readonly polygons: readonly HomeMapPolygonShape[];
}

export interface OverlayTrailPoint extends RenderPoint {
  readonly opacity: number;
}

export interface OverlayTrackDraw {
  readonly deviceId: string;
  readonly id: string;
  readonly head: RenderPoint;
  readonly trail: readonly OverlayTrailPoint[];
  readonly ringM: number;
}

export interface OverlayClimateChip {
  readonly roomId: string;
  readonly at: RenderPoint;
  readonly temperature: OverlayReading | null;
  readonly pm25: OverlayReading | null;
  readonly heat: number | null;
}

export interface OverlayOpeningDraw {
  readonly id: string;
  readonly contact: 'open' | 'closed' | 'unknown' | null;
  readonly leafDeg: number;
  readonly warning: boolean;
  readonly locked: boolean | null;
}

export interface OverlayVacuumDraw {
  readonly robot: RenderPose | null;
  readonly dock: RenderPose | null;
  readonly trail: readonly RenderTrailRun[];
  readonly live: boolean;
}

export interface OverlayCameraDraw {
  readonly deviceId: string;
  readonly view: HomeMapCameraView;
  readonly faint: boolean;
  readonly dashed: boolean;
  readonly note: string | null;
}

export interface OverlayAlertDraw {
  readonly deviceId: string;
  readonly roomId: string | null;
  readonly kind: OverlayAlertKind;
  readonly pulse: boolean;
}

export interface OverlayBadge {
  readonly deviceId: string;
  readonly offline: boolean;
  readonly lowBattery: boolean;
}

export interface OverlayModel {
  readonly zones: readonly OverlayZoneFill[];
  readonly activeRooms: readonly string[];
  readonly motionDevices: readonly string[];
  readonly tracks: readonly OverlayTrackDraw[];
  readonly climate: readonly OverlayClimateChip[];
  readonly openings: readonly OverlayOpeningDraw[];
  readonly vacuum: OverlayVacuumDraw | null;
  readonly cameras: readonly OverlayCameraDraw[];
  readonly alerts: readonly OverlayAlertDraw[];
  readonly badges: readonly OverlayBadge[];
}
