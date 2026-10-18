import type { ReactNode } from 'react';
import { View } from 'react-native';
import { bytes } from '../../../format/number';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { StackBar } from '../storage/stack-bar';
import { LockLine, NeedLine } from '../screens/detail-parts';
import { dataRows, type DataRow, type NetworkSection } from './network-model';

function Row({ row }: { readonly row: DataRow }): ReactNode {
  const parts = [
    { key: 'wifi', label: 'Wi-Fi', weight: row.wifi, colour: 'viz-1', text: bytes(row.wifi) },
    {
      key: 'mobile',
      label: 'Mobile',
      weight: row.mobile,
      colour: 'viz-2',
      text: bytes(row.mobile),
    },
  ] as const;
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="callout">{row.label}</Text>
        <Text variant="callout" tone="variant" className="tabular">
          {row.total}
        </Text>
      </View>
      <StackBar parts={parts} label={row.spoken} />
    </View>
  );
}

export function DataCard({
  data,
  own,
  person,
}: {
  readonly data: NetworkSection['data'];
  readonly own: boolean;
  readonly person: string;
}): ReactNode {
  const rows = dataRows(data);
  return (
    <Card title="Data use" icon="download">
      {rows.length === 0 ? (
        own ? (
          <NeedLine text="Allow App usage access on the phone to see data use" />
        ) : (
          <LockLine text={`Data use stays with ${person}`} />
        )
      ) : (
        rows.map((row) => <Row key={row.key} row={row} />)
      )}
    </Card>
  );
}
