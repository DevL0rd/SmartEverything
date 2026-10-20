import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { IconWell } from '../../../../components/icon-well';
import { Text } from '../../../../components/text';
import { summaryLine, type InterfaceRows } from './interface-rows';

export interface PreviewCardProps {
  readonly name: string;
  readonly flavour: 'pure' | 'action';
  readonly rows: InterfaceRows;
}

export function PreviewCard({ name, flavour, rows }: PreviewCardProps): ReactNode {
  const shown = name.trim() === '' ? 'New Custom Node' : name.trim();
  return (
    <View
      accessible
      accessibilityLabel={`Preview of the new node ${shown}. ${summaryLine(rows)}`}
      className="min-h-16 flex-row items-center gap-3 rounded-lg border border-outline-variant bg-surface-raised p-3"
    >
      <IconWell icon="box" colour="primary" size="l" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" numberOfLines={1}>
          {shown}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {summaryLine(rows)}
        </Text>
      </View>
      <Badge label={flavour === 'pure' ? 'Function' : 'Action'} tone="primary" />
    </View>
  );
}
