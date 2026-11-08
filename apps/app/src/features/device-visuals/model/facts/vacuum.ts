import { vacuumValuesOf } from '@smarteverything/domain';
import { vacuumLookOfValues } from '../../visuals/vacuum/look';
import type { Decorate } from './decorate';

export const vacuumState: Decorate = (base, lookup) => {
  const values = vacuumValuesOf(
    lookup.presentation.capabilities,
    (key) => lookup.values[key]?.value,
  );
  const vacuum = vacuumLookOfValues(values, base.online);
  return { ...base, power: vacuum.asleep ? 'off' : 'on', vacuum };
};
