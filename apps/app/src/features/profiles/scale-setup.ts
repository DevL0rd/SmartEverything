import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BIND_KEY, BLUETOOTH_ADDRESS, isScale, type DeviceRow } from '@smarteverything/domain';
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

type ScaleRequest = { readonly deviceId: string } | { readonly form: ManualForm };

function addScale(request: ScaleRequest): Promise<DeviceRow> {
  if ('deviceId' in request) {
    return addXiaomiScale(request.deviceId);
  }
  const { form } = request;
  return addManualScale({
    name: form.name.trim(),
    address: form.address.trim().toUpperCase(),
    bindKey: form.bindKey.trim().toLowerCase(),
  });
}

function failureText(failure: ReturnType<typeof errorText>): string {
  return failure.detail === '' ? failure.title : failure.detail;
}

export function useAddScale(): {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly added: string | null;
  readonly fromXiaomi: (deviceId: string) => void;
  readonly manual: (form: ManualForm) => void;
} {
  const [invalid, setInvalid] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: addScale });
  const failure = mutation.error === null ? null : errorText(mutation.error);
  return {
    busy: mutation.isPending,
    problem: invalid ?? (failure === null ? null : failureText(failure)),
    added: mutation.data?.name ?? null,
    fromXiaomi: (deviceId): void => {
      setInvalid(null);
      mutation.mutate({ deviceId });
    },
    manual: (form): void => {
      const problem = problemOf(form);
      setInvalid(problem);
      if (problem === null) {
        mutation.mutate({ form });
      }
    },
  };
}
