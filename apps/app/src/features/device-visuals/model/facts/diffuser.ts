import { withRole, type CapabilityRole } from '@smarteverything/domain';
import type { DiffuserFacts } from '../../types';
import { flagOf, textOf, type Lookup } from '../lookup';
import type { Decorate } from './decorate';

function observedAtOf(lookup: Lookup, role: CapabilityRole): string | null {
  const presented = withRole(lookup.presentation, role);
  return presented === undefined ? null : (lookup.values[presented.key]?.observedAt ?? null);
}

function diffuserFacts(lookup: Lookup): DiffuserFacts {
  return {
    spray: observedAtOf(lookup, 'spray'),
    charging: textOf(lookup, 'charging_state') === 'Charging',
    fault: flagOf(lookup, 'fault') === true,
  };
}

export const diffuserState: Decorate = (base, lookup) => ({
  ...base,
  diffuser: diffuserFacts(lookup),
});
