import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ListeningClaimRecord } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { CLAIM_OUTCOME_LABELS } from './claim-stripe';
import { LoudnessBar } from './contest-card';
import { dbLabel } from './listening-model';

const SHOWN = 5;

export function ClaimList({
  claims,
  name,
}: {
  readonly claims: readonly ListeningClaimRecord[];
  readonly name: string;
}): ReactNode {
  const now = useMinute();
  if (claims.length === 0) {
    return (
      <View className="flex-row items-center gap-3 rounded-lg bg-surface-2 px-4 py-3">
        <Icon name="mic" />
        <Text variant="footnote" tone="variant" className="flex-1">
          Nothing heard here yet. The last five wakes from this source show up here.
        </Text>
      </View>
    );
  }
  return (
    <View accessibilityLabel={`Last wakes from ${name}`} className="gap-2.5">
      {claims.slice(0, SHOWN).map((claim) => (
        <View key={claim.at} className="flex-row items-center gap-2.5">
          <Text variant="caption" tone="variant" numberOfLines={1} className="w-20">
            {relative(claim.at, now)}
          </Text>
          <LoudnessBar dbfs={claim.snippetDbfs} won={claim.outcome === 'won'} />
          <Text variant="footnote" align="end" className="tabular w-14">
            {dbLabel(claim.snippetDbfs)}
          </Text>
          <Text
            variant="caption"
            tone={claim.outcome === 'won' ? 'positive' : 'variant'}
            align="end"
            numberOfLines={1}
            className="w-20"
          >
            {CLAIM_OUTCOME_LABELS[claim.outcome]}
          </Text>
        </View>
      ))}
    </View>
  );
}
