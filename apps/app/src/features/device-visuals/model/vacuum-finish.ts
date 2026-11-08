import { DEFAULT_VACUUM_FINISH, type VacuumFinish } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { localPref, setLocalPref, useLocalPref } from '../../../store/local-prefs';

const log = new Logger('app.device-visuals');

export function vacuumFinishOf(
  chosen: Readonly<Record<string, VacuumFinish>>,
  deviceId: string,
): VacuumFinish {
  return chosen[deviceId] ?? DEFAULT_VACUUM_FINISH;
}

export function useVacuumFinish(deviceId: string): VacuumFinish {
  return vacuumFinishOf(useLocalPref('vacuumFinishes'), deviceId);
}

export function chooseVacuumFinish(deviceId: string, finish: VacuumFinish): void {
  setLocalPref('vacuumFinishes', { ...localPref('vacuumFinishes'), [deviceId]: finish });
  log.info('vacuum.finish_chosen', { deviceId, finish });
}
