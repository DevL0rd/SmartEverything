import {
  API_ENDPOINTS as E,
  seal,
  type BodyReadingRow,
  type DeviceRow,
  type NewProfile,
  type ProfileChange,
  type ProfileRow,
  type WatchCandidates,
} from '@smarteverything/domain';
import { api } from './transport';

export async function createProfile(profile: NewProfile): Promise<ProfileRow> {
  return api().call(E.createProfile, { body: profile });
}

export async function updateProfile(profileId: string, change: ProfileChange): Promise<ProfileRow> {
  return api().call(E.updateProfile, { params: { profileId }, body: change });
}

export async function deleteProfile(profileId: string): Promise<void> {
  await api().call(E.deleteProfile, { params: { profileId } });
}

export async function selectProfile(profileId: string): Promise<void> {
  await api().call(E.selectProfile, { body: { profileId } });
}

export async function assignBodyReading(
  readingId: string,
  profileId: string | null,
): Promise<BodyReadingRow> {
  return api().call(E.assignBodyReading, { params: { readingId }, body: { profileId } });
}

export async function addXiaomiScale(xiaomiDeviceId: string): Promise<DeviceRow> {
  return api().call(E.addLocalDevice, {
    body: { driver: 'xiaomi_scale', source: 'xiaomi', xiaomiDeviceId },
  });
}

export interface ManualScale {
  readonly name: string;
  readonly address: string;
  readonly bindKey: string;
}

export async function addManualScale(scale: ManualScale): Promise<DeviceRow> {
  const { publicKey } = await api().call(E.sealingKey, {});
  return api().call(E.addLocalDevice, {
    body: {
      driver: 'xiaomi_scale',
      source: 'manual',
      name: scale.name,
      address: scale.address,
      bindKey: seal(publicKey, scale.bindKey),
    },
  });
}

export async function removeLocalDevice(deviceId: string): Promise<void> {
  await api().call(E.removeLocalDevice, { params: { deviceId } });
}

export async function listWatchCandidates(): Promise<WatchCandidates> {
  return api().call(E.listWatchCandidates, {});
}

export async function addXiaomiWatch(address: string, profileId: string): Promise<DeviceRow> {
  return api().call(E.addLocalDevice, {
    body: { driver: 'xiaomi_watch', source: 'xiaomi', address, profileId },
  });
}
