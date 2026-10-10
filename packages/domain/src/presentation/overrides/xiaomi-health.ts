import type { ModelOverride } from '../types';
import { XIAOMI_DEVICE_INFORMATION, hidden } from './xiaomi-common';

export const SCALE_S400_PRO: ModelOverride = {
  family: 'scale',
  capabilities: {
    ...XIAOMI_DEVICE_INFORMATION,
    'raw:action.6.1': hidden('Update a user'),
    'raw:action.6.2': hidden('Delete a user', { danger: { tier: 'typed', word: 'DELETE' } }),
    'raw:action.6.3': hidden('Update a weight'),
    'raw:action.6.4': hidden('Switch user'),
    'raw:action.6.5': hidden('Rename a user'),
    'raw:action.6.6': hidden('Request user names'),
    'raw:action.9.1': hidden('Request offline readings'),
    'raw:action.9.2': hidden('Confirm offline readings'),
    'raw:action.13.1': hidden('Sync'),
    'raw:action.14.1': hidden('Stop sharing'),
    'raw:action.15.1': hidden('Update display settings'),
  },
};

export const WATCH_S5: ModelOverride = {
  family: 'wearable',
  capabilities: XIAOMI_DEVICE_INFORMATION,
};
