import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationRunWouldSend } from '@smarteverything/domain';
import { Badge } from '../../../../components/badge';
import { Banner } from '../../../../components/banner';
import { Text } from '../../../../components/text';
import { wouldSendRows } from './test-model';

export const TEST_RUN_BANNER = 'Test run. Nothing was sent to your devices.';

export interface WouldSendPaneProps {
  readonly commands: readonly AutomationRunWouldSend[];
  readonly titles: ReadonlyMap<string, string>;
}

export function WouldSendPane({ commands, titles }: WouldSendPaneProps): ReactNode {
  const rows = wouldSendRows(commands, titles);
  return (
    <View className="gap-3">
      <Banner tone="info" title={TEST_RUN_BANNER} />
      <Text variant="body-strong">Would have sent</Text>
      {rows.length === 0 ? (
        <Text variant="callout" tone="variant">
          This test would not have sent anything.
        </Text>
      ) : (
        rows.map((row) => (
          <View key={row.key} className="gap-1 rounded-md bg-surface-2 p-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
                {row.title}
              </Text>
              <Badge label={row.outcome} tone={row.problem ? 'warning' : 'positive'} />
            </View>
            <Text variant="callout">{row.target}</Text>
            <Text variant="footnote" tone="variant">
              {row.value}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
