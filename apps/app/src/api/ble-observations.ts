import type { z } from 'zod';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type DeviceRow } from '@smarteverything/domain';
import { api } from './transport';

async function readObservation(
  deviceId: string,
): Promise<z.output<typeof E.readBleDevice.response>> {
  return api().call(E.readBleDevice, { params: { deviceId } });
}

export function useBleObservation(
  deviceId: string,
  revision: unknown,
): UseQueryResult<Awaited<ReturnType<typeof readObservation>>> {
  return useQuery({
    queryKey: ['window', 'ble-observation', deviceId, revision],
    queryFn: () => readObservation(deviceId),
  });
}

export async function enableDoorObservation(xiaomiDeviceId: string): Promise<DeviceRow> {
  return api().call(E.addLocalDevice, {
    body: { driver: 'xiaomi_magnet', source: 'xiaomi', xiaomiDeviceId },
  });
}

export async function disableDoorObservation(deviceId: string): Promise<void> {
  await api().call(E.removeBleObserver, { params: { deviceId } });
}
