import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Logger, background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { href } from '../../../app-shell/hrefs';
import { removeIrAppliance } from '../../../api/ir-appliances';
import { removeLocalDevice } from '../../../api/people';
import type { Device } from '../../../store/state';
import { applianceOf } from '../appliance/appliance-model';

const log = new Logger('app.devices');

interface Removal {
  readonly body: string;
  readonly run: () => Promise<void>;
}

function removalOf(device: Device): Removal {
  const appliance = applianceOf(device);
  if (appliance !== null) {
    return {
      body: 'Its learned buttons and remembered state go with it. The IR blaster stays.',
      run: () => removeIrAppliance(appliance.id),
    };
  }
  return { body: 'Its weigh-ins are removed too.', run: () => removeLocalDevice(device.id) };
}

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
  const removal = removalOf(device);
  const remove = async (): Promise<void> => {
    const yes = await confirm({
      title: `Remove ${name}?`,
      body: removal.body,
      confirmLabel: 'Remove',
      tone: 'destructive',
    });
    log.info('device.remove_confirmed', { deviceId: device.id, confirmed: yes });
    if (!yes) {
      return;
    }
    try {
      await removal.run();
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
