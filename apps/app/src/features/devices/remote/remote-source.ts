import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { useControl } from '../../../store/control';
import { useIrCodes } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { remoteKeysOf } from '../model/remote-layout';
import { categoryOfLearned, categoryOfDeviceRemote, type RemoteCategory } from './remote-category';

export interface RemoteSource {
  readonly id: string;
  readonly name: string;
  readonly category: RemoteCategory;
  readonly keys: readonly string[];
  readonly host: Device;
  readonly blaster: Device | null;
  readonly blasterName: string;
  readonly online: boolean;
  readonly send: (key: string) => Promise<boolean>;
}

class RemoteKeyMissingError extends Error {
  override readonly name = 'RemoteKeyMissingError';

  constructor(
    readonly remoteId: string,
    readonly key: string,
  ) {
    super(`The remote ${remoteId} has no learned button "${key}".`);
  }
}

const NO_BLASTER = 'Its blaster';

function useBlaster(blasterId: string | null): Device | null {
  return useStoreSelector(
    (state) => (blasterId === null ? null : (state.tables.devices.byId[blasterId] ?? null)),
    Object.is,
    [blasterId],
  );
}

export function useDeviceRemoteSource(device: Device): RemoteSource {
  const control = useControl(device.id, 'remote_key');
  const blaster = useBlaster(device.parent_id);
  const keys = remoteKeysOf(device.capabilities);
  return {
    id: device.id,
    name: device.label,
    category: categoryOfDeviceRemote(device.label, keys),
    keys,
    host: device,
    blaster,
    blasterName: blaster?.label ?? NO_BLASTER,
    online: device.online && (blaster?.online ?? false),
    send: (key) => control.set(key),
  };
}

function codeOf(codes: readonly IrCodeRow[], key: string): IrCodeRow | undefined {
  return codes.find((code) => code.button === key);
}

export function useLearnedSource(blaster: Device, remote: IrRemoteRow): RemoteSource {
  const codes = useIrCodes(remote.id);
  const control = useControl(blaster.id, 'ir_send');
  return {
    id: remote.id,
    name: remote.name,
    category: categoryOfLearned(remote.category),
    keys: codes.map((code) => code.button),
    host: blaster,
    blaster,
    blasterName: blaster.label,
    online: blaster.online,
    send: (key): Promise<boolean> => {
      const code = codeOf(codes, key);
      if (code === undefined) {
        return Promise.reject(new RemoteKeyMissingError(remote.id, key));
      }
      return control.set({ format: code.format, code: code.code });
    },
  };
}
