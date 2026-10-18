import type { VisualState } from '../../device-visuals';
import { useDeviceVisualState } from '../../device-visuals';
import { decimal } from '../../../format/number';
import { clock, dayLabel, shortDate } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { activeProfileIn, type WeighedReading } from '../../../store/people';
import { useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import type { Device } from '../../../store/state';
import { pickPerson, type Person } from './people';
import { useChosenPerson } from './selected-person';
import { useScaleReadings } from './use-scale-readings';
import { factsOf, type ScaleFacts } from './weigh-ins';

export interface Scale {
  readonly device: Device;
  readonly people: readonly Person[];
  readonly person: Person | null;
  readonly facts: ScaleFacts;
  readonly pending: readonly WeighedReading[];
  readonly now: number;
  readonly when: (iso: string, stale: boolean) => string;
}

const NO_WEIGH_INS: Person['weighIns'] = [];

const activeProfileId = (state: StoreState): string | null => activeProfileIn(state)?.id ?? null;
const timeZone = (state: StoreState): string | null => state.settings?.time_zone ?? null;

export function useActiveProfileId(): string | null {
  return useStoreSelector(activeProfileId);
}

export function useTimeZone(): string | null {
  return useStoreSelector(timeZone);
}

export function useScale(device: Device): Scale {
  const data = useScaleReadings(device);
  const now = useMinute();
  const zone = useTimeZone();
  const person = pickPerson(data.people, useChosenPerson(device.id), useActiveProfileId());
  return {
    device,
    people: data.people,
    person,
    facts: factsOf(person?.weighIns ?? NO_WEIGH_INS, now),
    pending: data.pending,
    now,
    when: (iso, stale) =>
      stale ? shortDate(iso) : `${dayLabel(iso, now, zone)} ${clock(iso, zone)}`,
  };
}

export function useScaleStage(device: Device, facts: ScaleFacts): VisualState {
  const base = useDeviceVisualState(device);
  const { latest } = facts;
  return {
    ...base,
    reading: latest === null ? null : { text: decimal(latest.kg, 1), unit: 'kg', at: latest.iso },
  };
}
