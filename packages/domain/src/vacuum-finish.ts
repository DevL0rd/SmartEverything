import { z } from 'zod';

export const VACUUM_FINISHES = ['graphite', 'white', 'black'] as const;

export const VACUUM_FINISH = z.enum(VACUUM_FINISHES);

export type VacuumFinish = z.infer<typeof VACUUM_FINISH>;

export const DEFAULT_VACUUM_FINISH: VacuumFinish = 'graphite';

export const VACUUM_FINISH_NAMES: Readonly<Record<VacuumFinish, string>> = {
  graphite: 'Graphite',
  white: 'White',
  black: 'Black',
};
