import type { PhoneContextState } from '@smarteverything/domain';

export const CONTEXT_TEXT: Readonly<Record<PhoneContextState, string>> = {
  unknown: 'Not sure yet',
  still: 'Still',
  walking: 'Walking',
  running: 'Running',
  cycling: 'Cycling',
  driving: 'Driving',
  navigating: 'Navigating',
  parked: 'Parked',
};
