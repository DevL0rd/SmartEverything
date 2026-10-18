import { background } from '@smarteverything/logging';
import type { JsonValue } from '@smarteverything/domain';
import { updateDevice } from '../../../api/devices';
import { useLedger } from '../../../store/store-context';
import { withInputName } from './input-names';
import type { Television } from './use-television';

export interface TelevisionActions {
  readonly setVolume: (level: number) => void;
  readonly chooseInput: (id: string) => void;
  readonly openApp: (name: string) => void;
  readonly goToChannel: (channel: number) => void;
  readonly renameInput: (id: string, name: string) => Promise<void>;
}

export function useTelevisionActions(tv: Television): TelevisionActions {
  const ledger = useLedger();
  const send = (capability: string, value: JsonValue): void => {
    background(ledger.send(tv.device, capability, value), 'television.command_failed', {
      deviceId: tv.device.id,
      capability,
    });
  };
  return {
    setVolume: (level): void => {
      send('volume', level);
    },
    chooseInput: (id): void => {
      send('input_source', id);
    },
    openApp: (name): void => {
      send('app_launch', name);
    },
    goToChannel: (channel): void => {
      send('channel', channel);
    },
    renameInput: (id, name): Promise<void> =>
      updateDevice(tv.device.id, { input_names: withInputName(tv.view.inputs, id, name) }),
  };
}
