import type { StateAdapter } from './adapter';
import { MEMORY_ADAPTERS } from './adapters-memory';
import { TIMING_ADAPTERS } from './adapters-timing';

export const STATE_ADAPTERS: Readonly<Record<string, StateAdapter>> = {
  ...TIMING_ADAPTERS,
  ...MEMORY_ADAPTERS,
};
