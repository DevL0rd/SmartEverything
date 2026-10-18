import { deviceFamily, type DeviceFamily } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { memoOnInputs } from '../../../store/memo-selector';
import { shallowEqual, useLedger, useStoreSelector } from '../../../store/store-context';
import { deviceValuesOf, rowsOf, type Device, type StoreState } from '../../../store/state';
import { deviceModelOf, powerStateOf } from '../../devices';

const log = new Logger('app.home');

const BULK_FAMILIES: ReadonlySet<DeviceFamily> = new Set(['light', 'switch', 'plug']);

const CONFIRM_ABOVE = 3;

const bulkByRoom = memoOnInputs(
  (state) => [state.tables.devices],
  (state): ReadonlyMap<string, readonly Device[]> => {
    const byRoom = new Map<string, Device[]>();
    for (const device of rowsOf(state.tables.devices)) {
      if (device.room_id === null || device.hidden || !BULK_FAMILIES.has(deviceFamily(device))) {
        continue;
      }
      const room = byRoom.get(device.room_id);
      if (room === undefined) {
        byRoom.set(device.room_id, [device]);
      } else {
        room.push(device);
      }
    }
    return byRoom;
  },
);

export function turnOffTargets(state: StoreState, roomId: string): readonly Device[] {
  return (bulkByRoom(state).get(roomId) ?? []).filter(
    (device) => powerStateOf(deviceModelOf(device), deviceValuesOf(state, device.id)) === 'on',
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
  const targets = useStoreSelector((state) => turnOffTargets(state, roomId), shallowEqual, [
    roomId,
  ]);
  const ledger = useLedger();
  if (targets.length === 0) {
    return null;
  }
  return {
    label: 'Turn off lights & plugs',
    icon: 'power',
    onPress: (): void => {
      background(
        approved(targets.length).then(async (yes) => {
          if (!yes) {
            log.info('room.turn_off_declined', { roomId, targets: targets.length });
            return;
          }
          const startedAt = Date.now();
          log.info('room.turn_off_started', { roomId, targets: targets.length });
          const outcomes = await Promise.all(
            targets.map((device) => ledger.send(device, 'power', false)),
          );
          const sent = outcomes.filter((outcome) => outcome.sent).length;
          log.info('room.turn_off_finished', {
            roomId,
            targets: targets.length,
            sent,
            refused: targets.length - sent,
            latencyMs: Date.now() - startedAt,
          });
          notify({ message: `Turned off ${plural(sent, 'device')}`, tone: 'positive' });
        }),
        'turn_off.approved_failed',
      );
    },
  };
}
