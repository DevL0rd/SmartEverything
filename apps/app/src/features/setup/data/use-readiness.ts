import { useMemo } from 'react';
import { localPref, setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { useStoreSelector } from '../../../store/store-context';
import { sameStoreFacts, storeFactsOf, type SetupFacts } from '../model/facts';
import { SETUP_ITEMS, type SetupItemId } from '../model/items';
import { readinessOf, type Readiness } from '../model/readiness';

function knownIds(stored: readonly string[]): readonly SetupItemId[] {
  return SETUP_ITEMS.map((item) => item.id).filter((id) => stored.includes(id));
}

export function useSetupFacts(): SetupFacts {
  const facts = useStoreSelector(storeFactsOf, sameStoreFacts);
  const reach = useLocalPref('setupReach');
  return useMemo(() => ({ ...facts, homeOnly: reach === 'home' }), [facts, reach]);
}

export function useReadiness(): Readiness {
  const facts = useSetupFacts();
  const skipped = useLocalPref('setupSkipped');
  return useMemo(() => readinessOf(facts, knownIds(skipped)), [facts, skipped]);
}

export function skipSetupItem(id: SetupItemId): void {
  const stored = localPref('setupSkipped');
  if (!stored.includes(id)) setLocalPref('setupSkipped', [...stored, id]);
}

export function unskipSetupItem(id: SetupItemId): void {
  setLocalPref(
    'setupSkipped',
    localPref('setupSkipped').filter((one) => one !== id),
  );
}
