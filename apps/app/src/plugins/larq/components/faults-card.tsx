import { bottleFaultName, type BottleFaultRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';

export function FaultsCard({ faults }: { readonly faults: readonly BottleFaultRow[] }): ReactNode {
  const now = useMinute();
  if (faults.length === 0) {
    return null;
  }
  return (
    <Card title="Faults" icon="alert">
      {faults.map((fault) => (
        <View
          key={`${fault.at}-${fault.type}`}
          className="min-h-touch-min flex-row items-center justify-between gap-3"
        >
          <View className="min-w-0 flex-1">
            <Text variant="body-strong">{bottleFaultName(fault.type)}</Text>
            <Text variant="footnote" tone="variant">
              {moment(fault.at, now)}
            </Text>
          </View>
          {fault.active ? <Badge label="Active" tone="critical" /> : null}
        </View>
      ))}
    </Card>
  );
}
