import type { BottleSourceParts } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { millilitres, percent } from '../../../format/number';
import { SOURCE_COLOUR, SOURCE_LABEL } from '../model/bottle-colours';
import { sourceRows, sourceSummary, type SourceRow } from '../model/source-model';

function Segment({ row }: { readonly row: SourceRow }): ReactNode {
  const fill = { backgroundColor: useColour(SOURCE_COLOUR[row.key]), flexGrow: row.ml };
  return <View style={fill} className="h-3 min-w-1 rounded-full" />;
}

function Swatch({ row }: { readonly row: SourceRow }): ReactNode {
  const fill = { backgroundColor: useColour(SOURCE_COLOUR[row.key]) };
  return <View style={fill} className="size-3 rounded-full" />;
}

export function SourceBar({
  parts,
  detailed = true,
}: {
  readonly parts: BottleSourceParts;
  readonly detailed?: boolean;
}): ReactNode {
  const rows = sourceRows(parts);
  if (rows.length === 0) {
    return null;
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={sourceSummary(parts)}
      className="gap-2"
    >
      <View className="flex-row gap-0.5">
        {rows.map((row) => (
          <Segment key={row.key} row={row} />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {rows.map((row) => (
          <View key={row.key} className="flex-row items-center gap-1.5">
            <Swatch row={row} />
            <Text variant="footnote" tone="variant">
              {SOURCE_LABEL[row.key]}
            </Text>
            <Text variant="footnote" className="tabular">
              {detailed
                ? `${millilitres(Math.round(row.ml))} · ${percent(row.share)}`
                : percent(row.share)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
