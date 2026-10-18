import type { ModelOverride } from '../types';

export const SMARTTHINGS_PHONE_PRESENCE: ModelOverride = {
  family: 'presence_phone',
  capabilities: {
    occupancy: { label: 'Presence', tier: 'reading', states: ['Home', 'Away'] },
  },
};
