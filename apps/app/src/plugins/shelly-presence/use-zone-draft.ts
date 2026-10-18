import { useState } from 'react';
import type { ShellyArea, ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';
import type { PresenceRequest } from './presence-operation';
import { background } from '@smarteverything/logging';

function delayText(value: number | null | undefined): string {
  return value === undefined || value === null ? '' : String(value);
}

function delayValue(text: string): number | null {
  return text === '' ? null : Number(text);
}

interface ZoneValues {
  readonly name: string;
  readonly enable: boolean;
  readonly area: ShellyArea;
  readonly present: string;
  readonly absent: string;
  readonly color: readonly number[] | undefined;
}

export interface ZoneDraft extends ZoneValues {
  readonly validArea: boolean;
  readonly operation: PresenceOperation;
  readonly setName: (value: string) => void;
  readonly setEnable: (value: boolean) => void;
  readonly setArea: (value: ShellyArea) => void;
  readonly setPresent: (value: string) => void;
  readonly setAbsent: (value: string) => void;
  readonly setColor: (value: readonly number[]) => void;
  readonly setValidArea: (value: boolean) => void;
  readonly save: () => void;
}

function zoneRequest(zone: ShellyZone | null, values: ZoneValues): PresenceRequest {
  const config = {
    ...(zone?.main === true ? {} : { name: values.name }),
    enable: values.enable,
    area: values.area,
    ...(values.color === undefined ? {} : { color: values.color }),
    presence_delay: delayValue(values.present),
    absence_delay: delayValue(values.absent),
  };
  return zone === null
    ? { action: 'add_zone', params: { config } }
    : { action: 'set_zone', params: { id: zone.config.id, config } };
}

const BLANK_ZONE: ZoneValues = {
  name: '',
  enable: true,
  area: [],
  present: '',
  absent: '',
  color: undefined,
};

function initialZone(zone: ShellyZone | null): ZoneValues {
  if (zone === null) return BLANK_ZONE;
  const { config } = zone;
  return {
    name: config.name ?? '',
    enable: config.enable ?? true,
    area: config.area ?? [],
    present: delayText(config.presence_delay),
    absent: delayText(config.absence_delay),
    color: config.color ?? undefined,
  };
}

export function useZoneDraft(sensor: ShellyDevice, zone: ShellyZone | null): ZoneDraft {
  const [values, setValues] = useState<ZoneValues>(initialZone(zone));
  const [validArea, setValidArea] = useState(true);
  const operation = usePresenceOperation(sensor);
  const patch = (change: Partial<ZoneValues>): void => {
    setValues({ ...values, ...change });
  };
  return {
    ...values,
    validArea,
    operation,
    setValidArea,
    save: (): void => {
      background(operation.run(zoneRequest(zone, values)), 'operation.run_failed');
    },
    setName: (name): void => {
      patch({ name });
    },
    setEnable: (enable): void => {
      patch({ enable });
    },
    setArea: (area): void => {
      patch({ area });
    },
    setPresent: (present): void => {
      patch({ present });
    },
    setAbsent: (absent): void => {
      patch({ absent });
    },
    setColor: (color): void => {
      patch({ color });
    },
  };
}
