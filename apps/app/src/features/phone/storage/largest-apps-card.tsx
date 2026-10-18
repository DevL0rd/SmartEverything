import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { RankedList } from '../../../components/ranked-list';
import { Text } from '../../../components/text';
import { LockLine } from '../screens/detail-parts';
import { largestApps, type StorageSection } from './storage-model';

export function LargestAppsCard({
  storage,
  own,
  person,
}: {
  readonly storage: StorageSection;
  readonly own: boolean;
  readonly person: string;
}): ReactNode {
  const entries = largestApps(storage);
  if (own && entries.length > 0) return <RankedList title="Largest apps" entries={entries} />;
  return (
    <Card title="Largest apps" icon="grid">
      {own ? (
        <Text variant="callout" tone="variant">
          No app sizes reported yet
        </Text>
      ) : (
        <LockLine text={`App names and sizes stay with ${person}. You see the totals above.`} />
      )}
    </Card>
  );
}
