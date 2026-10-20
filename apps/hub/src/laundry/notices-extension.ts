import { UNLOAD_PENDING_KEY, type LaundryNotices, type StateRow } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { DeviceNotices } from '../extensions/device-notices';
import type { ExtensionContext, ServerExtension } from '../extensions';
import { LaundryNotifier } from './notices';

interface LaundryNoticesOptions {
  readonly notices: DeviceNotices;
  readonly clock: Pick<Clock, 'now' | 'at'>;
}

function notifierOf(context: ExtensionContext, options: LaundryNoticesOptions): LaundryNotifier {
  const { store } = context;
  return new LaundryNotifier({
    notices: (): LaundryNotices => store.settings.read().laundry_notices,
    machineName: (deviceId): string | null => {
      const device = store.devices.find(deviceId);
      return device === undefined ? null : (device.display_name ?? device.name);
    },
    pendingUnloads: (): readonly StateRow[] =>
      store.state.list().filter((row) => row.capability === UNLOAD_PENDING_KEY),
    clock: options.clock,
    raise: (notice): void => {
      options.notices.raise(notice);
    },
    log: context.log.child({ actorId: 'laundry-notices' }),
  });
}

export function laundryNoticesExtension(options: LaundryNoticesOptions): ServerExtension {
  return (context) => {
    const notifier = notifierOf(context, options);
    notifier.start();
    const unsubscribe = context.store.feed.subscribe((change) => {
      notifier.changed(change);
    });
    return Promise.resolve({
      endpoints: {},
      routes: [],
      stop: (): Promise<void> => {
        unsubscribe();
        notifier.stop();
        return Promise.resolve();
      },
    });
  };
}
