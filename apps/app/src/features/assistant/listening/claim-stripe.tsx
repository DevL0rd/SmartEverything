import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ListeningClaimRecord } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { claimBarHeight, dbLabel } from './listening-model';

const SHOWN = 5;

function heightOf(dbfs: number): { readonly height: number } {
  return { height: claimBarHeight(dbfs) };
}

export const CLAIM_OUTCOME_LABELS: Readonly<Record<ListeningClaimRecord['outcome'], string>> = {
  won: 'Answered',
  stood_down: 'Stood down',
  superseded: 'Handed over',
};

export function ClaimStripe({
  claims,
  name,
}: {
  readonly claims: readonly ListeningClaimRecord[];
  readonly name: string;
}): ReactNode {
  const latest = claims[0];
  if (latest === undefined) {
    return (
      <View className="hidden medium:flex">
        <Text variant="caption" tone="faint">
          No wakes yet
        </Text>
      </View>
    );
  }
  const bars = claims.slice(0, SHOWN).reverse();
  return (
    <View
      role="img"
      accessibilityLabel={`${name}: last ${String(bars.length)} wakes, latest ${dbLabel(latest.snippetDbfs)}, ${CLAIM_OUTCOME_LABELS[latest.outcome].toLowerCase()}`}
      className="shrink-0 flex-row items-end gap-2"
    >
      <View aria-hidden className="h-6 flex-row items-end gap-0.5">
        {bars.map((claim) => (
          <View
            key={claim.at}
            style={heightOf(claim.snippetDbfs)}
            className={cn(
              'w-1.5 rounded-xs',
              claim.outcome === 'won' ? 'bg-primary' : 'bg-on-surface-faint',
            )}
          />
        ))}
      </View>
      <View className="hidden w-14 medium:flex">
        <Text variant="caption" tone="variant" align="end" className="tabular">
          {dbLabel(latest.snippetDbfs)}
        </Text>
      </View>
    </View>
  );
}
