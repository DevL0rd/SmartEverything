import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationFunctionDetail } from '@smarteverything/domain';
import { Card } from '../../../../components/card';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { useAutomations } from '../../data/use-automations';
import { sameStepsRows, sameStepsSummary, type SameStepsRow } from './same-steps-model';

function Row({
  row,
  onOpen,
}: {
  readonly row: SameStepsRow;
  readonly onOpen: (automationId: string) => void;
}): ReactNode {
  return (
    <Interactive
      label={`${row.name}. ${row.text}`}
      onPress={() => {
        onOpen(row.id);
      }}
      className="min-h-touch-min flex-row items-center justify-between gap-2"
    >
      <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
        {row.name}
      </Text>
      <Text variant="footnote" tone="variant">
        {row.text}
      </Text>
    </Interactive>
  );
}

export function SameSteps({
  detail,
  onOpen,
}: {
  readonly detail: AutomationFunctionDetail;
  readonly onOpen: (automationId: string) => void;
}): ReactNode {
  const { rows: automations } = useAutomations();
  const rows = useMemo(() => sameStepsRows(detail, automations), [detail, automations]);
  return (
    <Card title="Automations with the same steps" icon="search">
      <View className="gap-1" accessibilityLiveRegion="polite">
        <Text variant="callout" tone="variant">
          {sameStepsSummary(rows)}
        </Text>
        {rows.map((row) => (
          <Row key={row.id} row={row} onOpen={onOpen} />
        ))}
      </View>
    </Card>
  );
}
