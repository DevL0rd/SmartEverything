import { useMemo } from 'react';
import type { VacuumCleaningCommand } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { Device } from '../../../../store/state';
import { notify } from '../../../../components/toast-store';
import { useLedger } from '../../../../store/store-context';
import type { RoomSelection } from '../model/room-selection';
import { useVacuum } from './use-vacuum';
import {
  cleanRoomsCommand,
  cleanZonesCommand,
  cleaningCommand,
  type RunOptions,
  type VacuumCommand,
  type ZoneRect,
} from './actions';

export interface VacuumActions {
  readonly command: (command: VacuumCleaningCommand) => void;
  readonly cleanRooms: (selection: RoomSelection, options?: RunOptions) => void;
  readonly cleanZones: (zones: readonly ZoneRect[], repeats?: RunOptions['repeats']) => void;
}

export function useVacuumActions(device: Device): VacuumActions {
  const ledger = useLedger();
  return useMemo(() => {
    const send = (command: VacuumCommand | null): void => {
      if (command === null) {
        return;
      }
      background(ledger.send(device, command.capability, command.value), 'vacuum.command_failed', {
        deviceId: device.id,
        capability: command.capability,
      });
    };
    return {
      command: (command): void => {
        send(cleaningCommand(command));
      },
      cleanRooms: (selection, options): void => {
        send(cleanRoomsCommand(selection, options));
      },
      cleanZones: (zones, repeats): void => {
        send(cleanZonesCommand(zones, repeats));
      },
    };
  }, [device, ledger]);
}

export const VACUUM_IDENTIFY_ROLE = 'vacuum_identify';

export const LOCATE_SENT = 'Playing a sound on the robot';

export function useVacuumLocate(device: Device): (() => void) | undefined {
  const ledger = useLedger();
  const key = useVacuum(device).keyOf(VACUUM_IDENTIFY_ROLE);
  if (key === undefined) {
    return undefined;
  }
  return (): void => {
    const sent = ledger.send(device, key, null).then(() => {
      notify({ message: LOCATE_SENT });
    });
    background(sent, 'vacuum.command_failed', {
      deviceId: device.id,
      capability: key,
    });
  };
}
