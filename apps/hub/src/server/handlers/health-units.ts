import type { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { z } from 'zod';
import { storeUnit } from '../../store/host/unit';

export interface HealthIngest {
  readonly clientId: string;
  readonly profileId: string;
  readonly body: z.output<typeof E.ingestHealth.body>;
}

export interface FitnessChange {
  readonly profileId: string;
  readonly body: z.output<typeof E.updateFitnessSettings.body>;
}

export const HEALTH_WRITE_UNITS = {
  ingestHealth: storeUnit((store, { clientId, profileId, body }: HealthIngest) => {
    const result = store.health.ingest(body, profileId);
    store.healthSources.synced(clientId, body.grantedTypes);
    return result;
  }),
  updateFitnessSettings: storeUnit((store, { profileId, body }: FitnessChange) => {
    store.profiles.updateFitness(profileId, body);
    return store.settings.read();
  }),
} as const;
