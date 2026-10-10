import type { ModelOverride } from '../types';

export const SMARTTHINGS_PHONE_PRESENCE: ModelOverride = {
  family: 'sensor',
  capabilities: {
    occupancy: { label: 'Presence', tier: 'reading', states: ['Home', 'Away'] },
  },
};
