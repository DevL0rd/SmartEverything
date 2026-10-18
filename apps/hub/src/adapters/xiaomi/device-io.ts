import { chunk, type JsonValue } from '@smarteverything/domain';
import {
  actionParams,
  checkPropertyWrites,
  cloudRpc,
  getPropertiesParams,
  parseActionResult,
  parsePropertyReadings,
  setPropertiesParams,
  type ActionAddress,
  type PropertyAddress,
  type PropertyReading,
  type PropertyWrite,
  type Transport,
} from '@smarteverything/xiaomi';
import type { XiaomiCloud } from './cloud-api';
import type { MiioClient } from './miio-client';

const LAN_BATCH = 15;
const CLOUD_BATCH = 150;

export interface DeviceIo {
  readonly transport: Transport;
  readonly read: (properties: readonly PropertyAddress[]) => Promise<PropertyReading[]>;
  readonly write: (writes: readonly PropertyWrite[]) => Promise<void>;
  readonly action: (action: ActionAddress, inputs: readonly JsonValue[]) => Promise<JsonValue>;
  readonly miio: (method: string, params: JsonValue) => Promise<JsonValue>;
  readonly close: () => Promise<void>;
}

type Caller = (payload: JsonValue) => Promise<JsonValue>;

async function readInBatches(
  call: Caller,
  did: string,
  properties: readonly PropertyAddress[],
  size: number,
): Promise<PropertyReading[]> {
  const readings: PropertyReading[] = [];
  for (const batch of chunk(properties, size)) {
    readings.push(...parsePropertyReadings(await call(getPropertiesParams(did, batch))));
  }
  return readings;
}

export function lanIo(did: string, client: MiioClient): DeviceIo {
  const call: Caller = (payload) => client.call('get_properties', payload);
  return {
    transport: 'lan',
    read: (properties) => readInBatches(call, did, properties, LAN_BATCH),
    write: async (writes): Promise<void> => {
      checkPropertyWrites(await client.call('set_properties', setPropertiesParams(did, writes)));
    },
    action: async (action, inputs) =>
      parseActionResult(action, await client.call('action', actionParams(did, action, inputs))),
    miio: (method, params) => client.call(method, params),
    close: () => client.close(),
  };
}

export function cloudIo(did: string, cloud: XiaomiCloud): DeviceIo {
  const call: Caller = (payload) => cloud.call('/miotspec/prop/get', { params: payload });
  return {
    transport: 'cloud',
    read: (properties) => readInBatches(call, did, properties, CLOUD_BATCH),
    write: async (writes): Promise<void> => {
      checkPropertyWrites(
        await cloud.call('/miotspec/prop/set', { params: setPropertiesParams(did, writes) }),
      );
    },
    action: async (action, inputs) =>
      parseActionResult(
        action,
        await cloud.call('/miotspec/action', { params: actionParams(did, action, inputs) }),
      ),
    miio: async (method, params): Promise<JsonValue> => {
      const rpc = cloudRpc(did, method, params);
      return cloud.call(rpc.path, rpc.data);
    },
    close: () => Promise.resolve(),
  };
}
