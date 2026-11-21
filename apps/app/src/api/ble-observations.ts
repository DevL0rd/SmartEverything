import type { z } from 'zod';
import { type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../queries/use-screen-query';
import { API_ENDPOINTS as E, type DeviceRow } from '@smarteverything/domain';
import { api } from './transport';

async function readObservation(
  deviceId: string,
  signal: AbortSignal,
): Promise<z.output<typeof E.readBleDevice.response>> {
  return api().call(E.readBleDevice, { params: { deviceId } }, { signal });
}

export function useBleObservation(
  deviceId: string,
  revision: unknown,
): UseQueryResult<Awaited<ReturnType<typeof readObservation>>> {
  return useScreenQuery({
    queryKey: ['window', 'ble-observation', deviceId, revision],
    queryFn: ({ signal }) => readObservation(deviceId, signal),
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
