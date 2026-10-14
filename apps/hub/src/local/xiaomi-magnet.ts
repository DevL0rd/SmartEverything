import { z } from 'zod';
import {
  decodeMagnetFrame,
  hexToBytes,
  MIBEACON_SERVICE_UUID,
  parseMiBeacon,
  XIAOMI_MAGNET_MODEL,
  MagnetPacketError,
} from '@smarteverything/ble';
import {
  ApiError,
  BIND_KEY,
  BLUETOOTH_ADDRESS,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { DecodedAdvert, LocalDriverDefinition } from './driver-types';
import type { ResolvedSetup, SetupContext } from './setup-types';

export const xiaomiMagnetDriver: LocalDriverDefinition = {
  id: 'xiaomi_magnet',
  provider: 'xiaomi',
  describe: (): null => null,
  adverts: {
    watch: (entry) => ({
      address: entry.address,
      serviceUuid: MIBEACON_SERVICE_UUID,
      dataPrefix: '48008b09',
      dataMask: '4800ffff',
    }),
    decode: (entry, advert, key): DecodedAdvert => {
      if (advert.serviceUuid !== MIBEACON_SERVICE_UUID || advert.address !== entry.address) {
        throw new MagnetPacketError(
          'The advert service or address differs from the registered Xiaomi door.',
        );
      }
      return {
        kind: 'state',
        ...decodeMagnetFrame(parseMiBeacon(hexToBytes(advert.data)), entry.address, key),
      };
    },
  },
};

export async function magnetSetup(
  setup: Extract<LocalDeviceSetup, { driver: 'xiaomi_magnet' }>,
  context: SetupContext,
): Promise<ResolvedSetup> {
  const device = context.store.devices.byId(setup.xiaomiDeviceId);
  if (
    device.provider !== 'xiaomi' ||
    device.model !== XIAOMI_MAGNET_MODEL ||
    !device.external_id.startsWith('blt.')
  ) {
    throw new ApiError(
      'invalid_request',
      'Passive door observation requires an existing Xiaomi isa.magnet.dw2hl Bluetooth device.',
    );
  }
  const identity = await context.identities(device.external_id, XIAOMI_MAGNET_MODEL);
  return {
    entry: {
      externalId: device.external_id,
      driver: 'xiaomi_magnet',
      address: BLUETOOTH_ADDRESS.parse(identity.mac),
      name: device.display_name ?? device.name,
      config: {
        deviceId: device.id,
        model: device.model,
        accountScope: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .parse(identity.accountScope),
      },
    },
    key: BIND_KEY.parse(identity.bindKey),
    replaces: null,
  };
}
