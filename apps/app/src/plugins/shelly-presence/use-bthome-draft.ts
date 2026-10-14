import { useState } from 'react';
import {
  SHELLY_PRESENCE_ACTION,
  type ShellyBthomeComponent,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { serializeMetadata } from './virtual-model';
import { PRESENCE_FORM_OBJECT, type PresenceFormObject } from './form-model';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';

export interface BthomeDraft {
  readonly value: PresenceFormObject;
  readonly change: (value: PresenceFormObject) => void;
  readonly error: string | null;
  readonly conflict: boolean;
  readonly operation: PresenceOperation;
  readonly save: () => void;
}

export function useBthomeDraft(
  sensor: ShellyPresenceDevice,
  component: ShellyBthomeComponent | null,
  sensorType: boolean,
  address = '',
): BthomeDraft {
  const [value, change] = useState<PresenceFormObject>(
    component === null ? { addr: address } : PRESENCE_FORM_OBJECT.parse(component.config),
  );
  const [error, setError] = useState<string | null>(null);
  const [revision] = useState(sensor.revision);
  const operation = usePresenceOperation(sensor);
  const acceptedRevision = operation.acceptedRevision ?? revision;
  const save = (): void => {
    const parsed = bthomeAction(value, sensorType, component, acceptedRevision);
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    void operation.run(parsed.data);
  };
  return { value, change, error, conflict: acceptedRevision !== sensor.revision, operation, save };
}

function bthomeAction(
  value: PresenceFormObject,
  sensorType: boolean,
  component: ShellyBthomeComponent | null,
  revision: number | null,
): ReturnType<typeof SHELLY_PRESENCE_ACTION.safeParse> {
  const { id, ...values } = value;
  const config = {
    ...values,
    ...(values['meta'] === undefined ? {} : { meta: serializeMetadata(values['meta']) }),
    ...(sensorType
      ? {
          obj_id: values['obj_id'] === '' ? undefined : Number(values['obj_id']),
          idx: values['idx'] === '' ? undefined : Number(values['idx']),
        }
      : {}),
    ...(values['key'] === '' ? { key: null } : {}),
  };
  const action = bthomeActionName(sensorType, component === null);
  return SHELLY_PRESENCE_ACTION.safeParse({
    action,
    ...(id === undefined || id === '' ? {} : { id: Number(id) }),
    config,
    ...(revision === null ? {} : { expectedRevision: revision }),
  });
}
function bthomeActionName(sensorType: boolean, add: boolean): string {
  if (add) return sensorType ? 'bthome_add_sensor' : 'bthome_add_device';
  return sensorType ? 'bthome_sensor_config' : 'bthome_device_config';
}
