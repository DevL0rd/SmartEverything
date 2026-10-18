import { ApiError, type HealthEntryRow } from '@smarteverything/domain';
import { readEntry } from '../../api/nutrition';

export async function findEntry(id: string): Promise<HealthEntryRow | null> {
  try {
    return await readEntry(id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') {
      return null;
    }
    throw error;
  }
}
