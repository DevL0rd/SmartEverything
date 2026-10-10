import {
  API_ENDPOINTS as E,
  type FitnessSettingsChange,
  type HealthSourceRow,
} from '@smarteverything/domain';
import { api } from './transport';

export async function updateFitnessSettings(change: FitnessSettingsChange): Promise<void> {
  await api().call(E.updateFitnessSettings, { body: change });
}

export async function revokeHealthSource(sourceId: string): Promise<HealthSourceRow> {
  return api().call(E.revokeHealthSource, { params: { sourceId } });
}

export async function createHealthSource(name: string): Promise<string> {
  const issued = await api().call(E.createHealthSource, { body: { name } });
  return issued.token;
}
