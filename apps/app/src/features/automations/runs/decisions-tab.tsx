import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { count as formatCount } from '../../../format/number';
import { DECISION_TEXT, DECISION_WINDOWS, type DecisionRow } from './run-history-model';

function Counts({ row }: { readonly row: DecisionRow }): ReactNode {
  return (
    <View className="flex-row gap-4">
      {DECISION_WINDOWS.map((window) => (
        <View key={window.id} className="min-w-0 flex-1 gap-0.5">
          <Text
            variant="title-3"
            tone={row.counts[window.id] > 0 ? 'default' : 'faint'}
            className="tabular"
          >
            {formatCount(row.counts[window.id])}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {window.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DecisionsTab({ rows }: { readonly rows: readonly DecisionRow[] }): ReactNode {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="circleCheck"
        title="Nothing was held back"
        body="Whenever a trigger fires but the automation does not run, the reason is counted here."
      />
    );
  }
  return (
    <View className="gap-3">
      {rows.map((row) => {
        const text = DECISION_TEXT[row.reason];
        return (
          <Card key={row.reason} label={`${text.title}, ${formatCount(row.counts.week)} in 7 days`}>
            <View className="gap-1">
              <Text variant="body-strong">{text.title}</Text>
              <Text variant="callout" tone="variant">
                {text.why}
              </Text>
            </View>
            <Counts row={row} />
          </Card>
        );
      })}
    </View>
  );
}
