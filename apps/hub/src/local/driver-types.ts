import type {
  BleAdvert,
  BleWatch,
  DiscoveredDevice,
  JsonValue,
  LocalDriver,
} from '@smarteverything/domain';
import type { ScaleMeasurement } from '../store/repositories/body-readings';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';

export type DecodedAdvert =
  | { readonly kind: 'measurement'; readonly measurement: Omit<ScaleMeasurement, 'deviceId'> }
  | { readonly kind: 'idle' };

export type WatchEntry = BleWatch['devices'][number];

export type Observed = Readonly<Record<string, JsonValue>>;

export interface AdvertHooks {
  readonly watch: (entry: LocalDeviceEntry) => WatchEntry;
  readonly decode: (entry: LocalDeviceEntry, advert: BleAdvert, key: string) => DecodedAdvert;
}

export interface LocalDriverDefinition {
  readonly id: LocalDriver;
  readonly describe: (entry: LocalDeviceEntry, observed: Observed) => DiscoveredDevice;
  readonly adverts: AdvertHooks | null;
}
