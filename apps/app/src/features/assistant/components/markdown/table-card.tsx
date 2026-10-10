import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CopyButton } from '../../../../components/copy-button';
import { Text } from '../../../../components/text';
import { useMeasuredWidth } from '../../../../components/use-measured-width';
import { useColour } from '../../../../design/colour';
import { cn } from '../../../../design/cn';
import { plural } from '../../../../format/text';
import { inlineText, tableTsv, type Block, type Inline } from './parse';
import { Runs } from './inline-runs';

type TableBlock = Extract<Block, { kind: 'table' }>;

const COLUMN = { min: 120, max: 320, perCharacter: 8, padding: 28 } as const;

const NUMERIC = /^[+\-−]?\d[\d.,\s]*[^\s\d]{0,4}$/;

function isNumeric(table: TableBlock, column: number): boolean {
  const cells = table.rows.map((row) => inlineText(row[column] ?? []).trim());
  return cells.length > 0 && cells.every((cell) => cell === '' || NUMERIC.test(cell));
}

function widthsOf(table: TableBlock, available: number): readonly number[] {
  const natural = table.header.map((head, column) => {
    const longest = Math.max(
      inlineText(head).length,
      ...table.rows.map((row) => inlineText(row[column] ?? []).length),
    );
    return Math.min(
      COLUMN.max,
      Math.max(COLUMN.min, longest * COLUMN.perCharacter + COLUMN.padding),
    );
  });
  const total = natural.reduce((sum, width) => sum + width, 0);
  return available > total ? natural.map((width) => (width * available) / total) : natural;
}

function columnStyle(width: number): { readonly width: number } {
  return { width };
}

function Row({
  cells,
  widths,
  numeric,
  head,
}: {
  readonly cells: readonly (readonly Inline[])[];
  readonly widths: readonly number[];
  readonly numeric: readonly boolean[];
  readonly head: boolean;
}): ReactNode {
  return (
    <View className={cn('flex-row', head ? 'bg-surface-1' : 'border-t border-outline-variant')}>
      {widths.map((width, column) => (
        <View
          key={column}
          style={columnStyle(width)}
          className={cn('px-3.5 py-2.5', numeric[column] === true && 'items-end')}
        >
          <Runs
            inline={cells[column] ?? []}
            variant="callout"
            tone={head ? 'variant' : 'default'}
            weight={head ? 'medium' : 'regular'}
            align={numeric[column] === true ? 'end' : 'start'}
          />
        </View>
      ))}
    </View>
  );
}

function EdgeFade(): ReactNode {
  const id = `fade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const surface = useColour('surface-1');
  return (
    <View pointerEvents="none" className="absolute inset-y-0 right-0 w-8">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={surface} stopOpacity={0} />
            <Stop offset="1" stopColor={surface} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function useEnd(): {
  readonly atEnd: boolean;
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly onContentSize: (width: number) => void;
  readonly onLayout: (width: number) => void;
} {
  const [offset, setOffset] = useState(0);
  const [content, setContent] = useState(0);
  const [view, setView] = useState(0);
  return {
    atEnd: content <= view + 1 || offset + view >= content - 1,
    onScroll: (event): void => {
      setOffset(event.nativeEvent.contentOffset.x);
    },
    onContentSize: setContent,
    onLayout: setView,
  };
}

export function TableCard({ table }: { readonly table: TableBlock }): ReactNode {
  const frame = useMeasuredWidth();
  const end = useEnd();
  const widths = widthsOf(table, frame.width);
  const numeric = table.header.map((_head, column) => isNumeric(table, column));
  return (
    <View
      onLayout={frame.onLayout}
      className="overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-1"
    >
      <View className="min-h-9 flex-row items-center bg-surface-2 pl-3.5 pr-0.5">
        <Text variant="caption" tone="variant" className="flex-1">
          {plural(table.rows.length, 'row')}
        </Text>
        <CopyButton value={tableTsv(table)} label="Copy table" />
      </View>
      <View>
        <ScrollView
          horizontal
          className="grow-0"
          scrollEventThrottle={64}
          onScroll={end.onScroll}
          onContentSizeChange={end.onContentSize}
          onLayout={(event) => {
            end.onLayout(event.nativeEvent.layout.width);
          }}
        >
          <View>
            <Row cells={table.header} widths={widths} numeric={numeric} head />
            {table.rows.map((row, index) => (
              <Row key={index} cells={row} widths={widths} numeric={numeric} head={false} />
            ))}
          </View>
        </ScrollView>
        {end.atEnd ? null : <EdgeFade />}
      </View>
    </View>
  );
}
