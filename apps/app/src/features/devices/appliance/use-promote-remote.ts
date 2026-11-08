import { useRouter } from 'expo-router';
import type { IrRemoteRow } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { promoteIrRemote } from '../../../api/ir-appliances';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { BUTTONS_SECTION } from './appliance-model';

const log = new Logger('app.devices');

export function usePromoteRemote(): (remote: IrRemoteRow) => void {
  const router = useRouter();
  const promote = async (remote: IrRemoteRow): Promise<void> => {
    const yes = await confirm({
      title: `Make ${remote.name} a device?`,
      body: 'It moves from this blaster to Devices with its own page, buttons and room, and still sends through this blaster.',
      confirmLabel: 'Make it a device',
    });
    log.info('remote.promote_confirmed', { remoteId: remote.id, confirmed: yes });
    if (!yes) {
      return;
    }
    try {
      const appliance = await promoteIrRemote(remote.id);
      if (appliance.device_id === null) {
        log.warn('remote.promoted_without_device', { applianceId: appliance.id });
        notify({
          message: `${remote.name} is a device now and shows in Devices once the hub lists it`,
          tone: 'default',
        });
        return;
      }
      router.push(href.deviceSection(appliance.device_id, BUTTONS_SECTION));
    } catch (error: unknown) {
      log.error('remote.promote_failed', error, { remoteId: remote.id });
      notify({ message: `${remote.name} was not made a device`, error, tone: 'critical' });
    }
  };
  return (remote) => {
    background(promote(remote), 'remote.promote_failed');
  };
}
