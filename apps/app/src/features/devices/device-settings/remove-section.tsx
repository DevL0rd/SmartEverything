import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { href } from '../../../app-shell/hrefs';
import { removeLocalDevice } from '../../../api/people';
import type { Device } from '../../../store/state';

const log = new Logger('app.devices');

export function RemoveSection({
  device,
  name,
}: {
  readonly device: Device;
  readonly name: string;
}): ReactNode {
  const router = useRouter();
  if (device.provider !== 'local') {
    return null;
  }
  const remove = async (): Promise<void> => {
    const yes = await confirm({
      title: `Remove ${name}?`,
      body: 'Its weigh-ins are removed too.',
      confirmLabel: 'Remove',
      tone: 'destructive',
    });
    log.info('device.remove_confirmed', { deviceId: device.id, confirmed: yes });
    if (!yes) {
      return;
    }
    try {
      await removeLocalDevice(device.id);
      log.info('device.removed', { deviceId: device.id });
      router.replace(href.devices());
    } catch (error: unknown) {
      log.error('device.remove_failed', error, { deviceId: device.id });
      notify({
        message: `${name} was not removed`,
        error,
        tone: 'critical',
      });
    }
  };
  return (
    <List>
      <ListRow
        title={`Remove ${name}`}
        icon="trash"
        destructive
        onPress={() => {
          background(remove(), 'remove_section.remove_failed');
        }}
      />
    </List>
  );
}
