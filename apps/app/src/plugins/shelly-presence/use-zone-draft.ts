import { useState } from 'react';
import {
  SHELLY_PRESENCE_ACTION,
  type ShellyArea,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
  type ShellyPresenceZone,
} from '@smarteverything/domain';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';

function delayText(value: number | null | undefined): string {
  return value === undefined || value === null ? '' : String(value);
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
  readonly conflict: boolean;
  readonly validation: string | null;
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

function zoneAction(
  zone: ShellyPresenceZone | null,
  values: ZoneValues,
  revision: number | null,
): ShellyPresenceAction {
  const config = {
    ...(zone?.main === true ? {} : { name: values.name }),
    enable: values.enable,
    area: values.area,
    ...(values.color === undefined ? {} : { color: values.color }),
    presence_delay: values.present === '' ? null : Number(values.present),
    absence_delay: values.absent === '' ? null : Number(values.absent),
  };
  return SHELLY_PRESENCE_ACTION.parse({
    action: zone === null ? 'add_zone' : 'set_zone',
    ...(zone === null ? {} : { id: zone.config.id }),
    config,
    ...(revision === null ? {} : { expectedRevision: revision }),
  });
}

export function useZoneDraft(
  sensor: ShellyPresenceDevice,
  zone: ShellyPresenceZone | null,
): ZoneDraft {
  const [values, setValues] = useState<ZoneValues>(initialZone(zone));
  const [validArea, setValidArea] = useState(true);
  const [validation, setValidation] = useState<string | null>(null);
  const [revision] = useState(sensor.revision);
  const operation = usePresenceOperation(sensor);
  const acceptedRevision = operation.acceptedRevision ?? revision;
  const save = (): void => {
    try {
      const action = zoneAction(zone, values, acceptedRevision);
      setValidation(null);
      void operation.run(action);
    } catch (caught) {
      setValidation(caught instanceof Error ? caught.message : String(caught));
    }
  };
  return {
    ...values,
    validArea,
    conflict: acceptedRevision !== sensor.revision,
    validation,
    operation,
    setValidArea,
    save,
    setName: (name): void => {
      setValues({ ...values, name });
    },
    setEnable: (enable): void => {
      setValues({ ...values, enable });
    },
    setArea: (area): void => {
      setValues({ ...values, area });
    },
    setPresent: (present): void => {
      setValues({ ...values, present });
    },
    setAbsent: (absent): void => {
      setValues({ ...values, absent });
    },
    setColor: (color): void => {
      setValues({ ...values, color });
    },
  };
}

function initialZone(zone: ShellyPresenceZone | null): ZoneValues {
  return {
    name: zone?.config.name ?? '',
    enable: zone?.config.enable ?? true,
    area: zone?.config.area ?? [],
    present: delayText(zone?.config.presence_delay),
    absent: delayText(zone?.config.absence_delay),
    color: zone?.config.color,
  };
}
