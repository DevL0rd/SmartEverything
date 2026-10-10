import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { href } from '../../../app-shell/hrefs';
import { removeLocalDevice } from '../../../api/people';
import type { Device } from '../../../store/state';

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
    if (!yes) {
      return;
    }
    try {
      await removeLocalDevice(device.id);
      router.replace(href.devices());
    } catch (error: unknown) {
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
          void remove();
        }}
      />
    </List>
  );
}
