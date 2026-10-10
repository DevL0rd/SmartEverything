import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';

const MIIO_DEVICE_ID_LIMIT = 0xff_ff_ff_ff;
const LAN_TOKEN = z
  .string()
  .regex(/^[0-9a-f]{32}$/i)
  .refine((token) => !/^0+$/.test(token));

const ID = z.union([z.string().min(1), z.number().int()]).transform(String);

const CLOUD_DEVICE = z.object({
  did: ID,
  name: z.string().min(1),
  model: z.string().min(1),
  token: z.string().optional(),
  localip: z.string().optional(),
  mac: z.string().optional(),
  parent_id: z.string().optional(),
  isOnline: z.boolean(),
  spec_type: z.string().optional(),
});

const DEVICE_LIST = z.object({ list: z.array(z.unknown()) });

const HOME_LIST = z.object({
  homelist: z
    .array(
      z.object({
        name: z.string(),
        roomlist: z
          .array(z.object({ name: z.string().min(1), dids: z.array(ID).default([]) }))
          .default([]),
      }),
    )
    .default([]),
});

export interface CloudDevice {
  readonly did: string;
  readonly name: string;
  readonly model: string;
  readonly token: string | null;
  readonly ip: string | null;
  readonly mac: string | null;
  readonly parentDid: string | null;
  readonly online: boolean;
  readonly specType: string | null;
}

export interface DeviceListPage {
  readonly devices: readonly CloudDevice[];
  readonly malformed: number;
}

export type Transport = 'lan' | 'cloud';

export interface TransportChoice {
  readonly transport: Transport;
  readonly reason: string;
}

export const DEVICE_LIST_PATH = '/home/device_list';
export const HOME_LIST_PATH = '/v2/homeroom/gethome';

export function deviceListData(): JsonValue {
  return {
    getVirtualModel: true,
    getHuamiDevices: 1,
    get_split_device: false,
    support_smart_home: true,
  };
}

export function homeListData(): JsonValue {
  return {
    fg: true,
    fetch_share: true,
    fetch_share_dev: true,
    limit: 300,
    app_ver: 7,
  };
}

function present(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value;
}

function normalize(device: z.infer<typeof CLOUD_DEVICE>): CloudDevice {
  return {
    did: device.did,
    name: device.name,
    model: device.model,
    token: present(device.token),
    ip: present(device.localip),
    mac: present(device.mac),
    parentDid: present(device.parent_id),
    online: device.isOnline,
    specType: present(device.spec_type),
  };
}

export function parseDeviceList(result: unknown): DeviceListPage {
  const page = DEVICE_LIST.safeParse(result);
  const entries = page.success ? page.data.list : [];
  const devices = entries.flatMap((entry) => {
    const parsed = CLOUD_DEVICE.safeParse(entry);
    return parsed.success ? [normalize(parsed.data)] : [];
  });
  return { devices, malformed: entries.length - devices.length + (page.success ? 0 : 1) };
}

export function parseRoomNames(result: unknown): ReadonlyMap<string, string> {
  const parsed = HOME_LIST.safeParse(result);
  const rooms = new Map<string, string>();
  for (const home of parsed.success ? parsed.data.homelist : []) {
    for (const room of home.roomlist) {
      for (const did of room.dids) {
        rooms.set(did, room.name);
      }
    }
  }
  return rooms;
}

const IPV4 = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,3}){3}$/)
  .transform((text) => text.split('.').map(Number))
  .refine((octets) => octets.every((octet) => octet <= 255));

const PRIVATE_RANGES: readonly (readonly [number, number, number])[] = [
  [10, 0, 255],
  [172, 16, 31],
  [192, 168, 168],
  [169, 254, 254],
];

function isPrivateIpv4(address: string): boolean {
  const parsed = IPV4.safeParse(address);
  if (!parsed.success) {
    return false;
  }
  const [first, second = -1] = parsed.data;
  return PRIVATE_RANGES.some(
    ([network, low, high]) => first === network && second >= low && second <= high,
  );
}

function isMiioDeviceId(did: string): boolean {
  return /^\d+$/.test(did) && Number(did) <= MIIO_DEVICE_ID_LIMIT;
}

export function chooseTransport(device: CloudDevice): TransportChoice {
  if (device.parentDid !== null) {
    return { transport: 'cloud', reason: `it is reached through its gateway ${device.parentDid}` };
  }
  if (!isMiioDeviceId(device.did)) {
    return {
      transport: 'cloud',
      reason: 'its id is not a miIO device id (Bluetooth or virtual device)',
    };
  }
  if (device.ip === null) {
    return { transport: 'cloud', reason: 'the cloud reports no LAN address for it' };
  }
  if (!isPrivateIpv4(device.ip)) {
    return {
      transport: 'cloud',
      reason: `its reported address ${device.ip} is not a private IPv4 LAN address`,
    };
  }
  if (!LAN_TOKEN.safeParse(device.token).success) {
    return { transport: 'cloud', reason: 'the cloud holds no usable LAN token for it' };
  }
  return { transport: 'lan', reason: `it has a LAN token and the address ${device.ip}` };
}
