import { colord } from 'colord';
import {
  withRole,
  type CapabilityRole,
  type HomeMapLookPref,
  type JsonValue,
  type ModelSpec,
} from '@smarteverything/domain';
import type {
  OverlayAlertKind,
  OverlayDeviceState,
  OverlayInput,
  OverlayModel,
  OverlayReading,
  OverlayRoomClimate,
  OverlaySensor,
  OverlayVacuumInput,
} from '../../../components/house-map/overlays/model-types';
import { overlayModel } from '../../../components/house-map/overlays/model';
import {
  floorLighting,
  lightEmitterFacts,
  type FloorLighting,
  type LightState,
} from '../../../components/house-map/lighting';
import {
  describeHomeMapStage,
  type HomeMapSummaryLive,
} from '../../../components/house-map/summary';
import type { RenderFloor, RenderPlacement } from '../../../components/house-map/render-scene';
import type { DeviceValues } from '../../../store/state';
import { presentedColourCss } from '../../device-visuals';
import type { MetricReading } from '../../climate';
import { lightPartsOf, lightStateOf, type DeviceModel } from '../../devices';

export const BATTERY_LOW_PERCENT = 20;

const ALERT_ROLES: readonly OverlayAlertKind[] = ['leak', 'smoke', 'gas'];

export interface LiveSource {
  readonly model: DeviceModel;
  readonly values: DeviceValues;
}

export interface LiveFacts {
  readonly devices: Readonly<Record<string, OverlayDeviceState>>;
  readonly lights: Readonly<Record<string, LightState>>;
  readonly climate: Readonly<Record<string, readonly MetricReading[]>>;
}

export interface LivePresence {
  readonly sensors: readonly OverlaySensor[];
  readonly trackingLease: boolean;
  readonly now: number;
}

export interface HomeMapLiveOptions {
  readonly mapName?: string | null;
  readonly selectedDeviceId?: string | null;
  readonly animate?: boolean;
  readonly presence?: LivePresence;
  readonly vacuum?: OverlayVacuumInput | null;
  readonly specOf?: (placement: RenderPlacement) => ModelSpec | undefined;
}

export interface HomeMapLive {
  readonly overlay: OverlayModel;
  readonly lighting: FloorLighting;
  readonly summary: string;
}

const IDLE_PRESENCE: LivePresence = { sensors: [], trackingLease: false, now: 0 };

function valueAt(source: LiveSource, role: CapabilityRole): JsonValue | undefined {
  const presented = withRole(source.model.presentation, role);
  return presented === undefined ? undefined : source.values[presented.key]?.value;
}

function flag(source: LiveSource, role: CapabilityRole): boolean | null {
  const value = valueAt(source, role);
  return typeof value === 'boolean' ? value : null;
}

function alertOf(source: LiveSource): OverlayAlertKind | null {
  return ALERT_ROLES.find((role) => flag(source, role) === true) ?? null;
}

function batteryLowOf(source: LiveSource): boolean | null {
  const level = valueAt(source, 'battery');
  return typeof level === 'number' ? level < BATTERY_LOW_PERCENT : null;
}

function ptzOf(source: LiveSource): Pick<OverlayDeviceState, 'ptz'> | null {
  const presented = withRole(source.model.presentation, 'ptz_preset');
  if (presented === undefined) return null;
  const preset = source.values[presented.key]?.value;
  return {
    ptz: { preset: typeof preset === 'string' ? preset : null, live: null, moveUncertain: false },
  };
}

export function deviceStateOf(source: LiveSource): OverlayDeviceState {
  return {
    online: source.model.device.online,
    model: source.model.device.model,
    batteryLow: batteryLowOf(source),
    contactOpen: flag(source, 'contact'),
    locked: flag(source, 'lock'),
    occupied: flag(source, 'occupancy'),
    motion: flag(source, 'motion'),
    alert: alertOf(source),
    ...ptzOf(source),
  };
}

function colourHex(css: string | null): string | null {
  if (css === null) return null;
  const parsed = colord(css);
  return parsed.isValid() ? parsed.toHex() : null;
}

export function lightStateFor(source: LiveSource): LightState | null {
  if (source.model.device.kind !== 'light') return null;
  const parts = lightPartsOf(source.model);
  const state = lightStateOf(source.model, parts, source.values);
  const colourValue =
    parts.colour === null ? undefined : (source.values[parts.colour.key]?.value ?? undefined);
  return {
    on: state.power === 'on',
    brightness: state.level === null ? null : state.level / 100,
    colour:
      state.mode === 'colour' && parts.colour !== null
        ? colourHex(presentedColourCss(parts.colour, colourValue))
        : null,
    colourTempK: state.mode === 'white' ? state.kelvin : null,
  };
}

export function liveFactsOf(
  sources: readonly LiveSource[],
  climate: Readonly<Record<string, readonly MetricReading[]>>,
): LiveFacts {
  const devices: Record<string, OverlayDeviceState> = {};
  const lights: Record<string, LightState> = {};
  for (const source of sources) {
    devices[source.model.device.id] = deviceStateOf(source);
    const light = lightStateFor(source);
    if (light !== null) lights[source.model.device.id] = light;
  }
  return { devices, lights, climate };
}

function readingOf(reading: MetricReading | undefined): OverlayReading | null {
  return reading === undefined
    ? null
    : {
        amount: reading.amount,
        value: reading.value,
        unit: reading.unit,
        verdict: reading.verdict,
        tone: reading.tone,
        stale: reading.stale,
      };
}

export function roomClimateOf(
  climate: LiveFacts['climate'],
  look: HomeMapLookPref,
): ReadonlyMap<string, OverlayRoomClimate> {
  if (look.roomClimate === 'off') return new Map();
  return new Map(
    Object.entries(climate).map(([roomId, readings]) => [
      roomId,
      {
        temperature: readingOf(readings.find((reading) => reading.metric === 'temperature')),
        pm25: readingOf(readings.find((reading) => reading.metric === 'pm25')),
      },
    ]),
  );
}

export function overlayInputOf(
  floor: RenderFloor,
  look: HomeMapLookPref,
  facts: LiveFacts,
  options: HomeMapLiveOptions,
): OverlayInput {
  const presence = options.presence ?? IDLE_PRESENCE;
  return {
    floor,
    now: presence.now,
    devices: new Map(Object.entries(facts.devices)),
    climate: roomClimateOf(facts.climate, look),
    sensors: presence.sensors,
    trackingLease: presence.trackingLease,
    vacuum: look.showRobot ? (options.vacuum ?? null) : null,
    selectedDeviceId: options.selectedDeviceId ?? null,
    showAllCameraViews: look.showAllCameraViews,
    heatTint: look.roomClimate === 'chip_tint',
    animate: options.animate ?? false,
  };
}

export function gatedOverlay(model: OverlayModel, look: HomeMapLookPref): OverlayModel {
  return {
    ...model,
    ...(look.showPeople ? {} : { zones: [], tracks: [], activeRooms: [], motionDevices: [] }),
    ...(look.showOpeningState ? {} : { openings: [] }),
  };
}

function lightingFor(
  floor: RenderFloor,
  enabled: boolean,
  facts: LiveFacts,
  options: HomeMapLiveOptions,
): FloorLighting {
  return floorLighting({
    floor,
    enabled,
    lights: new Map(Object.entries(facts.lights)),
    emitterOf: (placement) => lightEmitterFacts(placement.mount, options.specOf?.(placement)),
  });
}

export function summaryLiveOf(
  floor: RenderFloor,
  facts: LiveFacts,
  overlay: OverlayModel,
  options: HomeMapLiveOptions,
): HomeMapSummaryLive {
  const lit = lightingFor(floor, true, facts, options);
  return {
    lightsOn: lit.rooms.flatMap((room) => (room.roomId === null ? [] : [room.roomId])),
    people: new Map(overlay.activeRooms.map((roomId) => [roomId, 1])),
    temperatures: new Map(
      overlay.climate.flatMap((chip) =>
        chip.temperature === null ? [] : [[chip.roomId, chip.temperature.value] as const],
      ),
    ),
  };
}

export function buildHomeMapLive(
  floor: RenderFloor,
  look: HomeMapLookPref,
  facts: LiveFacts,
  options: HomeMapLiveOptions = {},
): HomeMapLive {
  const overlay = gatedOverlay(overlayModel(overlayInputOf(floor, look, facts, options)), look);
  return {
    overlay,
    lighting: lightingFor(floor, look.lightUp, facts, options),
    summary: describeHomeMapStage(
      floor,
      options.mapName ?? null,
      summaryLiveOf(floor, facts, overlay, options),
    ),
  };
}
