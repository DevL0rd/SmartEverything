import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { UsageSum } from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { compact, percent } from '../../../format/number';
import { CostCard } from './cost-card';

export interface TokenFacts {
  readonly read: number;
  readonly cached: number;
  readonly cacheShare: number | null;
  readonly written: number;
  readonly thinking: number;
}

export function tokenFactsOf(
  sum: Pick<UsageSum, 'tokens_in' | 'tokens_out' | 'tokens_cached' | 'tokens_reasoning'>,
): TokenFacts {
  return {
    read: sum.tokens_in,
    cached: sum.tokens_cached,
    cacheShare: sum.tokens_in > 0 ? sum.tokens_cached / sum.tokens_in : null,
    written: sum.tokens_out,
    thinking: sum.tokens_reasoning,
  };
}

function Stat({
  title,
  value,
  caption,
}: {
  readonly title: string;
  readonly value: string;
  readonly caption: string;
}): ReactNode {
  return (
    <View className="min-w-32 flex-1 gap-0.5">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {title}
      </Text>
      <Figure value={value} size="m" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

export function TokenStrip({
  sum,
  rangeName,
}: {
  readonly sum: UsageSum;
  readonly rangeName: string;
}): ReactNode {
  const facts = tokenFactsOf(sum);
  if (facts.read + facts.written === 0) return null;
  return (
    <CostCard title="Tokens" icon="layers" accent="viz-4">
      <View className="flex-row flex-wrap gap-x-6 gap-y-3">
        <Stat title="Read" value={compact(facts.read)} caption={rangeName} />
        <Stat
          title="From cache"
          value={facts.cacheShare === null ? 'None' : percent(facts.cacheShare)}
          caption={`${compact(facts.cached)} of the tokens read`}
        />
        <Stat title="Written" value={compact(facts.written)} caption="Reply tokens" />
        <Stat title="Thinking" value={compact(facts.thinking)} caption="Reasoning tokens" />
      </View>
      {facts.cacheShare === null ? null : (
        <ProgressBar progress={facts.cacheShare} colour="viz-4" label="Read from cache" />
      )}
    </CostCard>
  );
}
