import { useState } from 'react';
import {
  SHELLY_PRESENCE_ACTION,
  type ShellyPresenceDevice,
  type ShellyResources,
} from '@smarteverything/domain';
import { callDraft, serializeCall, type CallDraft } from './schedule-calls';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';

export type ScheduleRow = NonNullable<ShellyResources['schedules']>['jobs'][number];
export interface ScheduleDraft {
  readonly timespec: string;
  readonly enable: boolean;
  readonly calls: readonly CallDraft[];
  readonly setTimespec: (value: string) => void;
  readonly setEnable: (value: boolean) => void;
  readonly setCalls: (value: readonly CallDraft[]) => void;
  readonly save: () => void;
  readonly error: string | null;
  readonly conflict: boolean;
  readonly operation: PresenceOperation;
}

export function useScheduleDraft(
  sensor: ShellyPresenceDevice,
  row: ScheduleRow | null,
): ScheduleDraft {
  const [timespec, setTimespec] = useState(row?.timespec ?? '0 0 8 * * *');
  const [enable, setEnable] = useState(row?.enable ?? true);
  const [calls, setCalls] = useState<readonly CallDraft[]>(
    row === null
      ? [{ method: 'Presence.SetSensor', params: { enable: true } }]
      : row.calls.map(callDraft),
  );
  const [error, setError] = useState<string | null>(null);
  const [revision] = useState(scheduleRevision(sensor));
  const operation = usePresenceOperation(sensor);
  const acceptedRevision = operation.resourceRevision ?? revision;
  const save = (): void => {
    try {
      const action = SHELLY_PRESENCE_ACTION.parse({
        action: row === null ? 'schedule_create' : 'schedule_update',
        ...(row === null ? {} : { id: row.id }),
        schedule: {
          enable,
          timespec,
          ...(row !== null && row.unavailableCalls.length > 0
            ? {}
            : { calls: calls.map(serializeCall) }),
        },
        ...(acceptedRevision === null ? {} : { expectedRevision: acceptedRevision }),
      });
      setError(null);
      void operation.run(action);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  return {
    timespec,
    enable,
    calls,
    setTimespec,
    setEnable,
    setCalls,
    save,
    error,
    conflict: acceptedRevision !== scheduleRevision(sensor),
    operation,
  };
}

function scheduleRevision(sensor: ShellyPresenceDevice): number | null {
  return sensor.resources?.schedules?.rev ?? null;
}
