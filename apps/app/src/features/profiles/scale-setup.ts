import { useState } from 'react';
import { BIND_KEY, BLUETOOTH_ADDRESS, isScale } from '@smarteverything/domain';
import { addManualScale, addXiaomiScale } from '../../api/people';
import { errorText } from '../../format/errors';
import { useDevices, useProviderLink } from '../../store/selectors';
import { isLocalScale } from '../../store/people';
import type { Device } from '../../store/state';

export interface ManualForm {
  readonly name: string;
  readonly address: string;
  readonly bindKey: string;
}

export const EMPTY_FORM: ManualForm = { name: 'Scale', address: '', bindKey: '' };

export function useAddedScale(): Device | null {
  return useDevices({ includeHidden: true }).find(isLocalScale) ?? null;
}

export function useXiaomiScale(): Device | null {
  const linked = useProviderLink('xiaomi')?.status === 'linked';
  const scale = useDevices({ includeHidden: true }).find(
    (device) =>
      device.provider === 'xiaomi' && device.external_id.startsWith('blt.') && isScale(device),
  );
  return linked && scale !== undefined ? scale : null;
}

function problemOf(form: ManualForm): string | null {
  if (form.name.trim() === '') {
    return 'Give the scale a name';
  }
  if (!BLUETOOTH_ADDRESS.safeParse(form.address).success) {
    return 'The Bluetooth address looks like D0:7B:6F:A6:AB:45';
  }
  return BIND_KEY.safeParse(form.bindKey).success
    ? null
    : 'The key is 32 letters and numbers (0–9, a–f)';
}

export function useAddScale(): {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly added: string | null;
  readonly fromXiaomi: (deviceId: string) => void;
  readonly manual: (form: ManualForm) => void;
} {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const run = (work: () => Promise<{ readonly name: string }>): void => {
    setBusy(true);
    setProblem(null);
    work().then(
      (device) => {
        setBusy(false);
        setAdded(device.name);
      },
      (error: unknown) => {
        setBusy(false);
        const text = errorText(error);
        setProblem(text.detail === '' ? text.title : text.detail);
      },
    );
  };
  return {
    busy,
    problem,
    added,
    fromXiaomi: (deviceId): void => {
      run(() => addXiaomiScale(deviceId));
    },
    manual: (form): void => {
      const invalid = problemOf(form);
      if (invalid !== null) {
        setProblem(invalid);
        return;
      }
      run(() =>
        addManualScale({
          name: form.name.trim(),
          address: form.address.trim().toUpperCase(),
          bindKey: form.bindKey.trim().toLowerCase(),
        }),
      );
    },
  };
}
