import type { SourceList } from '@smarteverything/xiaomi';
import type { SecretStore } from '../secrets/store';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { Store } from '../store/store';

export interface BluetoothIdentity {
  readonly mac: string;
  readonly bindKey: string;
  readonly accountScope?: string;
}

export type BluetoothIdentitySource = (
  did: string,
  expectedModel?: string,
) => Promise<BluetoothIdentity>;

export type WearableSource = () => Promise<SourceList>;

export interface ResolvedSetup {
  readonly entry: Omit<LocalDeviceEntry, 'createdAt'>;
  readonly key: string | null;
  readonly replaces: string | null;
}

export interface SetupContext {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly identities: BluetoothIdentitySource;
  readonly wearables: WearableSource;
  readonly now: () => Date;
}
