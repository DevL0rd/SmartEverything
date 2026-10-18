import { useMemo, useRef, useState } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import type { Control } from './control';
import { commandSucceeded, throttledSend } from './live-commands';
import { useEntityStore, useLedger } from './store-context';
import type { Device } from './state';

const LIVE_SEND_INTERVAL_MS = 200;

export function useLiveControl(
  device: Device,
  capability: string,
  control: Control,
  enabled: boolean,
): Control {
  const store = useEntityStore();
  const ledger = useLedger();
  const [draft, setDraft] = useState<{ readonly value: JsonValue } | null>(null);
  const revision = useRef(0);
  const deviceId = device.id;
  const send = useMemo(
    () =>
      throttledSend(async (value) => {
        const current = store.get().tables.devices.byId[deviceId];
        if (current === undefined) return false;
        const result = await ledger.send(current, capability, value);
        return result.sent && (await commandSucceeded(store, result.row));
      }, LIVE_SEND_INTERVAL_MS),
    [store, ledger, deviceId, capability],
  );
  if (!enabled) return control;
  return {
    ...control,
    value: draft === null ? control.value : draft.value,
    set: async (value): Promise<boolean> => {
      const current = ++revision.current;
      setDraft({ value });
      const success = await send(value);
      if (revision.current === current) setDraft(null);
      return success;
    },
  };
}
