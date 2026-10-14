import { useState } from 'react';
import type { ShellyPresenceDevice, ShellyVirtualComponent } from '@smarteverything/domain';
import { virtualConfigAction, virtualInitial, type VirtualType } from './virtual-model';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';
import type { PresenceFormObject } from './form-model';

export interface VirtualDraft {
  readonly type: VirtualType;
  readonly setType: (value: VirtualType) => void;
  readonly value: PresenceFormObject;
  readonly change: (value: PresenceFormObject) => void;
  readonly error: string | null;
  readonly conflict: boolean;
  readonly save: () => void;
  readonly operation: PresenceOperation;
}

export function useVirtualDraft(
  sensor: ShellyPresenceDevice,
  component: ShellyVirtualComponent | null,
): VirtualDraft {
  const [type, setKind] = useState<VirtualType>(component?.component ?? 'boolean');
  const [value, change] = useState(virtualInitial(component));
  const [error, setError] = useState<string | null>(null);
  const [revision] = useState(sensor.revision);
  const operation = usePresenceOperation(sensor);
  const acceptedRevision = operation.acceptedRevision ?? revision;
  const save = (): void => {
    try {
      const action = virtualConfigAction(type, value, component);
      setError(null);
      void operation.run({
        ...action,
        ...(acceptedRevision === null ? {} : { expectedRevision: acceptedRevision }),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  return {
    type,
    setType: (next): void => {
      setKind(next);
      change({
        name: value['name'] ?? '',
        ...(value['meta'] === undefined ? {} : { meta: value['meta'] }),
        persisted: false,
        options: [],
      });
    },
    value,
    change,
    error,
    conflict: acceptedRevision !== sensor.revision,
    save,
    operation,
  };
}
