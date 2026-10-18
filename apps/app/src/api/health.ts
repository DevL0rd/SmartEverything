import {
  API_ENDPOINTS as E,
  type FitnessSettingsChange,
  type HealthSourceRow,
} from '@smarteverything/domain';
import { api } from './transport';

export async function updateFitnessSettings(change: FitnessSettingsChange): Promise<void> {
  await api().call(E.updateFitnessSettings, { body: change });
}

export async function revokeHealthSource(clientId: string): Promise<void> {
  await api().call(E.revokeHealthSource, { params: { clientId } });
}

export async function createHealthSource(name: string): Promise<HealthSourceRow> {
  return api().call(E.createHealthSource, { body: { name } });
}
