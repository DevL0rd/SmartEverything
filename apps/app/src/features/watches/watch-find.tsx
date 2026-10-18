import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Logger } from '@smarteverything/logging';
import { Button } from '../../components/button';
import type { Device } from '../../store/state';
import { findControlOf, findRequestOf, type FindRequest } from './watch-card-model';
import { runInOrder } from './watch-config';
import { setRinging, useRinging } from './watch-ringing';

const log = new Logger('app.watch');

interface Find {
  readonly ringing: boolean;
  readonly pending: boolean;
  readonly toggle: () => void;
}

function useFindWatch(device: Pick<Device, 'id'>): Find {
  const ringing = useRinging(device.id);
  const mutation = useMutation({
    mutationFn: (request: FindRequest) => runInOrder(device.id, [request]),
    onSuccess: (_outcome, request): void => {
      setRinging(device.id, request.on);
    },
    onError: (error): void => {
      log.error('watch.find_failed', error, { deviceId: device.id });
    },
  });
  return {
    ringing,
    pending: mutation.isPending,
    toggle: (): void => {
      mutation.mutate(findRequestOf(ringing));
    },
  };
}

export function FindWatchButton({
  device,
  lastSeen,
}: {
  readonly device: Device;
  readonly lastSeen: number | null;
}): ReactNode {
  const find = useFindWatch(device);
  const control = findControlOf(find.ringing, find.pending, lastSeen);
  return (
    <Button
      label={control.label}
      icon="bell"
      variant={control.filled ? 'filled' : 'tonal'}
      loading={control.loading}
      disabled={control.disabled}
      onPress={find.toggle}
    />
  );
}
