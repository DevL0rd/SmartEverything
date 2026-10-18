import {
  PHONE_CONTEXT_STATE,
  PHONE_NETWORKS,
  PHONE_VALUES,
  type PhoneContextState,
  type PhoneValues,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DeviceValues } from '../../store/state';

const NETWORK = z.enum(PHONE_NETWORKS);

const SHAPE = PHONE_VALUES.shape;

const NETWORK_TEXT: Readonly<Record<z.infer<typeof NETWORK>, string>> = {
  wifi: 'Wi-Fi',
  cellular: 'Mobile data',
  ethernet: 'Ethernet',
  other: 'Connected',
  offline: 'Offline',
};

type Reported<K extends keyof PhoneValues> = NonNullable<PhoneValues[K]> | null;

export interface PhoneDoing {
  readonly state: Exclude<PhoneContextState, 'unknown'>;
  readonly at: string;
}

export interface PhoneVolumes {
  readonly media: number | null;
  readonly ring: number | null;
  readonly alarm: number | null;
  readonly notification: number | null;
}

export interface PhoneReadings {
  readonly battery: number | null;
  readonly charging: boolean;
  readonly doing: PhoneDoing | null;
  readonly network: string | null;
  readonly screenMinutes: number | null;
  readonly nowPlaying: string | null;
  readonly reportedAt: string | null;
  readonly networkKind: Reported<'network'>;
  readonly signalBars: number | null;
  readonly charger: Reported<'charger'>;
  readonly chargeFullAt: string | null;
  readonly temperature: number | null;
  readonly powerSave: boolean | null;
  readonly thermal: Reported<'thermal_state'>;
  readonly ringerMode: Reported<'ringer_mode'>;
  readonly dnd: boolean | null;
  readonly volumes: PhoneVolumes;
  readonly audioOutput: Reported<'audio_output'>;
  readonly playback: Reported<'playback'>;
  readonly inCall: boolean | null;
  readonly ringing: boolean | null;
  readonly screenOn: boolean | null;
  readonly brightness: number | null;
  readonly autoBrightness: boolean | null;
  readonly flashlight: Reported<'flashlight'>;
  readonly storageFree: number | null;
  readonly notificationCount: number | null;
  readonly nextAlarm: string | null;
  readonly place: string | null;
  readonly confidence: number | null;
}

function read<S extends z.ZodType>(
  schema: S,
  values: DeviceValues,
  key: keyof PhoneValues,
): NonNullable<z.output<S>> | null {
  const parsed = schema.safeParse(values[key]?.value);
  return parsed.success ? (parsed.data ?? null) : null;
}

function doingOf(values: DeviceValues): PhoneDoing | null {
  const reading = values['phone_context'];
  const state = PHONE_CONTEXT_STATE.safeParse(reading?.value);
  if (reading === undefined || !state.success || state.data === 'unknown') {
    return null;
  }
  return { state: state.data, at: reading.observedAt };
}

function reportedAtOf(values: DeviceValues): string | null {
  let latest: { readonly at: string; readonly time: number } | null = null;
  for (const { observedAt } of Object.values(values)) {
    const time = Date.parse(observedAt);
    if (latest === null || time > latest.time) latest = { at: observedAt, time };
  }
  return latest?.at ?? null;
}

function volumesOf(values: DeviceValues): PhoneVolumes {
  return {
    media: read(SHAPE.volume, values, 'volume'),
    ring: read(SHAPE.ring_volume, values, 'ring_volume'),
    alarm: read(SHAPE.alarm_volume, values, 'alarm_volume'),
    notification: read(SHAPE.notification_volume, values, 'notification_volume'),
  };
}

function powerOf(
  values: DeviceValues,
): Pick<
  PhoneReadings,
  'battery' | 'charger' | 'chargeFullAt' | 'charging' | 'powerSave' | 'temperature' | 'thermal'
> {
  return {
    battery: read(SHAPE.battery, values, 'battery'),
    charging: values['charging']?.value === true,
    charger: read(SHAPE.charger, values, 'charger'),
    chargeFullAt: read(SHAPE.charge_full_at, values, 'charge_full_at'),
    temperature: read(SHAPE.battery_temperature, values, 'battery_temperature'),
    powerSave: read(SHAPE.power_save, values, 'power_save'),
    thermal: read(SHAPE.thermal_state, values, 'thermal_state'),
  };
}

function soundOf(
  values: DeviceValues,
): Pick<
  PhoneReadings,
  | 'audioOutput'
  | 'dnd'
  | 'inCall'
  | 'nowPlaying'
  | 'playback'
  | 'ringerMode'
  | 'ringing'
  | 'volumes'
> {
  const playing = values['now_playing']?.value;
  return {
    ringerMode: read(SHAPE.ringer_mode, values, 'ringer_mode'),
    dnd: read(SHAPE.dnd, values, 'dnd'),
    volumes: volumesOf(values),
    audioOutput: read(SHAPE.audio_output, values, 'audio_output'),
    playback: read(SHAPE.playback, values, 'playback'),
    nowPlaying: typeof playing === 'string' && playing !== '' ? playing : null,
    inCall: read(SHAPE.in_call, values, 'in_call'),
    ringing: read(SHAPE.ringing, values, 'ringing'),
  };
}

function screenOf(
  values: DeviceValues,
): Pick<
  PhoneReadings,
  'autoBrightness' | 'brightness' | 'flashlight' | 'screenMinutes' | 'screenOn'
> {
  return {
    screenOn: read(SHAPE.screen_on, values, 'screen_on'),
    screenMinutes: read(SHAPE.screen_time_today, values, 'screen_time_today'),
    brightness: read(SHAPE.brightness, values, 'brightness'),
    autoBrightness: read(SHAPE.auto_brightness, values, 'auto_brightness'),
    flashlight: read(SHAPE.flashlight, values, 'flashlight'),
  };
}

function connectionOf(
  values: DeviceValues,
): Pick<PhoneReadings, 'network' | 'networkKind' | 'signalBars'> {
  const network = NETWORK.safeParse(values['network']?.value);
  return {
    network: network.success ? NETWORK_TEXT[network.data] : null,
    networkKind: network.success ? network.data : null,
    signalBars: read(SHAPE.signal_strength, values, 'signal_strength'),
  };
}

export function phoneReadingsOf(values: DeviceValues): PhoneReadings {
  return {
    ...powerOf(values),
    ...soundOf(values),
    ...screenOf(values),
    ...connectionOf(values),
    doing: doingOf(values),
    reportedAt: reportedAtOf(values),
    storageFree: read(SHAPE.storage_free, values, 'storage_free'),
    notificationCount: read(SHAPE.notification_count, values, 'notification_count'),
    nextAlarm: read(SHAPE.next_alarm, values, 'next_alarm'),
    place: read(SHAPE.place, values, 'place'),
    confidence: read(SHAPE.context_confidence, values, 'context_confidence'),
  };
}

export function doingIcon(doing: PhoneDoing): 'car' | 'footprints' {
  return doing.state === 'driving' || doing.state === 'navigating' || doing.state === 'parked'
    ? 'car'
    : 'footprints';
}
