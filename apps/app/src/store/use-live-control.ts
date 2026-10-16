import { useRef, useState } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import type { Control } from './control';
import { liveCommands } from './live-commands';
import { useEntityStore, useLedger } from './store-context';
import type { Device } from './state';

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
  if (!enabled) return control;
  return {
    ...control,
    value: draft === null ? control.value : draft.value,
    set: async (value): Promise<boolean> => {
      const current = ++revision.current;
      setDraft({ value });
      const success = await liveCommands(store, ledger).set(device, capability, value);
      if (revision.current === current) setDraft(null);
      return success;
    },
  };
}
