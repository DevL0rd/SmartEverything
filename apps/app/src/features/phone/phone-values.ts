import {
  PHONE_CONTEXT_STATE,
  PHONE_NETWORKS,
  type PhoneContextState,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DeviceValues } from '../../store/state';

const NETWORK = z.enum(PHONE_NETWORKS);

const NETWORK_TEXT: Readonly<Record<z.infer<typeof NETWORK>, string>> = {
  wifi: 'Wi-Fi',
  cellular: 'Mobile data',
  ethernet: 'Ethernet',
  other: 'Connected',
  offline: 'Offline',
};

export interface PhoneDoing {
  readonly state: Exclude<PhoneContextState, 'unknown'>;
  readonly at: string;
}

export interface PhoneReadings {
  readonly battery: number | null;
  readonly charging: boolean;
  readonly doing: PhoneDoing | null;
  readonly network: string | null;
  readonly screenMinutes: number | null;
  readonly nowPlaying: string | null;
}

function numberOf(values: DeviceValues, key: string): number | null {
  const value = values[key]?.value;
  return typeof value === 'number' ? value : null;
}

function doingOf(values: DeviceValues): PhoneDoing | null {
  const reading = values['phone_context'];
  const state = PHONE_CONTEXT_STATE.safeParse(reading?.value);
  if (reading === undefined || !state.success || state.data === 'unknown') {
    return null;
  }
  return { state: state.data, at: reading.observedAt };
}

export function phoneReadingsOf(values: DeviceValues): PhoneReadings {
  const network = NETWORK.safeParse(values['network']?.value);
  const playing = values['now_playing']?.value;
  return {
    battery: numberOf(values, 'battery'),
    charging: values['charging']?.value === true,
    doing: doingOf(values),
    network: network.success ? NETWORK_TEXT[network.data] : null,
    screenMinutes: numberOf(values, 'screen_time_today'),
    nowPlaying: typeof playing === 'string' && playing !== '' ? playing : null,
  };
}

export function doingIcon(doing: PhoneDoing): 'car' | 'footprints' {
  return doing.state === 'driving' || doing.state === 'navigating' || doing.state === 'parked'
    ? 'car'
    : 'footprints';
}
