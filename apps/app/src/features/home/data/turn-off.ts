import { deviceFamily, type DeviceFamily } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { shallowEqual, useLedger, useStoreSelector } from '../../../store/store-context';
import { rowsOf, type Device, type StoreState } from '../../../store/state';
import { deviceModelOf, powerStateOf } from '../../devices';

const BULK_FAMILIES: ReadonlySet<DeviceFamily> = new Set(['light', 'switch', 'plug']);

const CONFIRM_ABOVE = 3;

function targetsIn(state: StoreState, roomId: string): Device[] {
  return rowsOf(state.tables.devices).filter(
    (device) =>
      device.room_id === roomId &&
      !device.hidden &&
      BULK_FAMILIES.has(deviceFamily(device)) &&
      powerStateOf(deviceModelOf(device), state.deviceValues[device.id] ?? {}) === 'on',
  );
}

async function approved(count: number): Promise<boolean> {
  if (count <= CONFIRM_ABOVE) {
    return true;
  }
  return confirm({
    title: `Turn off ${plural(count, 'light or plug', 'lights and plugs')}?`,
    confirmLabel: 'Turn off',
  });
}

export function useTurnOff(roomId: string): MenuItem | null {
  const targets = useStoreSelector((state) => targetsIn(state, roomId), shallowEqual);
  const ledger = useLedger();
  if (targets.length === 0) {
    return null;
  }
  return {
    label: 'Turn off lights & plugs',
    icon: 'power',
    onPress: (): void => {
      void approved(targets.length).then(async (yes) => {
        if (!yes) {
          return;
        }
        const outcomes = await Promise.all(
          targets.map((device) => ledger.send(device, 'power', false)),
        );
        const sent = outcomes.filter((outcome) => outcome.sent).length;
        notify({ message: `Turned off ${plural(sent, 'device')}`, tone: 'positive' });
      });
    },
  };
}
