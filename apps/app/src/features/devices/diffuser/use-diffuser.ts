import { hoursSinceRefill } from '@smarteverything/domain';
import { useMinuteOf } from '../../../store/clock';
import { useDeviceDerived } from '../../../store/selectors';
import { rowsOf, type Device } from '../../../store/state';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';
import { useDeviceModel, type DeviceModel } from '../model/device-model';
import { readDiffuser, type DiffuserRead } from './diffuser-read';
import { scheduleOf, type ScheduleLine } from './diffuser-model';

export function useDiffuserReadOf(device: Device, model: DeviceModel): DiffuserRead {
  return useDeviceDerived(device.id, (values) => readDiffuser(model, values), [model]);
}

export function useDiffuserRead(device: Device): DiffuserRead {
  return useDiffuserReadOf(device, useDeviceModel(device));
}

export function useDiffuserSchedule(deviceId: string): ScheduleLine | null {
  return useStoreSelector(
    (state) => scheduleOf(rowsOf(state.tables.automations), deviceId),
    sameJson,
    [deviceId],
  );
}

function useRefilledAt(deviceId: string): string | null {
  return useStoreSelector((state) => state.settings?.device_refills[deviceId] ?? null, Object.is, [
    deviceId,
  ]);
}

export function useHoursSinceRefill(deviceId: string): number | null {
  const refilledAt = useRefilledAt(deviceId);
  return useMinuteOf(
    (now) => (refilledAt === null ? null : hoursSinceRefill(refilledAt, new Date(now))),
    Object.is,
  );
}
