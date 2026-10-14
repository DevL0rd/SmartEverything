import { useState } from 'react';
import { SHELLY_PRESENCE_ACTION, type ShellyPresenceDevice } from '@smarteverything/domain';
import type { PresenceField } from './presence-fields';
import { completeCorePatch } from './interface-data';
import { type PresenceFormObject } from './form-model';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';

export interface CoreDraft {
  readonly value: PresenceFormObject;
  readonly validation: string | null;
  readonly conflict: boolean;
  readonly operation: PresenceOperation;
  readonly change: (path: string, value: PresenceFormObject[string]) => void;
  readonly reload: () => void;
  readonly save: () => void;
}

interface CoreFormTarget {
  readonly action: 'set_presence' | 'set_light' | 'set_component';
  readonly id: unknown;
  readonly component: string | undefined;
  readonly accepted: unknown;
}
export function useCoreForm(
  sensor: ShellyPresenceDevice,
  fields: readonly PresenceField[],
  target: CoreFormTarget,
): CoreDraft {
  const [value, setValue] = useState<PresenceFormObject>({});
  const [validation, setValidation] = useState<string | null>(null);
  const [revision, setRevision] = useState(sensor.revision);
  const operation = usePresenceOperation(sensor);
  const acceptedRevision = operation.acceptedRevision ?? revision;
  const reload = (): void => {
    operation.resetAcceptance();
    setValue({});
    setRevision(sensor.revision);
  };
  const save = (): void => {
    const parsed = SHELLY_PRESENCE_ACTION.safeParse({
      action: target.action,
      config:
        target.action === 'set_component'
          ? {
              component: target.component,
              value: completeCorePatch(fields, value, target.accepted),
            }
          : completeCorePatch(fields, value, target.accepted),
      ...(acceptedRevision === null ? {} : { expectedRevision: acceptedRevision }),
      ...(target.action === 'set_light' ? { id: target.id } : {}),
    });
    if (!parsed.success) {
      setValidation(parsed.error.message);
      return;
    }
    setValidation(null);
    void operation.run(parsed.data).then((saved) => {
      if (saved) reload();
    });
  };
  return {
    value,
    validation,
    conflict: Object.keys(value).length > 0 && acceptedRevision !== sensor.revision,
    operation,
    save,
    reload,
    change: (path, next): void => {
      if (Object.keys(value).length === 0) setRevision(sensor.revision);
      setValue({ ...value, [path]: next });
    },
  };
}
