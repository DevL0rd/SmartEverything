import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Arc, ProgressBar } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetFrame, isTall, type WidgetSize } from '../../../components/widget-board';
import type { ColourRole } from '../../../design/tokens';
import { useClimateSources } from '../model/climate-devices';
import { needsAttention, suppliesOf, type SupplyKind, type SupplyLine } from '../model/supplies';

const SHOWN: Readonly<Record<WidgetSize, number>> = { S: 1, M: 2, W: 4, L: 5, XL: 8 };

const ICON: Readonly<Record<SupplyKind, IconName>> = {
  filter: 'layers',
  water: 'glassWater',
  fault: 'warning',
};

const TONE_COLOUR: Readonly<Record<SupplyLine['tone'], ColourRole>> = {
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  info: 'info',
};

function useSupplies(room: string | null): readonly SupplyLine[] {
  const lines = useClimateSources(room).flatMap(suppliesOf);
  return [...lines].sort(
    (left, right) => Number(needsAttention(right)) - Number(needsAttention(left)),
  );
}

function Line({
  line,
  compact,
}: {
  readonly line: SupplyLine;
  readonly compact: boolean;
}): ReactNode {
  const colour = colourOf(line);
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      <IconWell icon={ICON[line.kind]} colour={colour} size={compact ? 's' : 'm'} />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-baseline gap-2">
          <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
            <Text variant="footnote" tone="variant">{`${line.device} · `}</Text>
            {line.label}
          </Text>
          <Text
            variant="footnote"
            tone={line.tone === 'positive' ? 'variant' : line.tone}
            numberOfLines={1}
          >
            {line.text}
          </Text>
        </View>
        {line.level === null ? null : (
          <ProgressBar
            progress={line.level}
            colour={colour}
            label={`${line.device} ${line.label}`}
          />
        )}
      </View>
    </View>
  );
}

const RING_LINES = 3;
const RING_SIZE = 120;

function colourOf(line: SupplyLine): ColourRole {
  return line.kind === 'water' && line.tone === 'positive' ? 'humidity' : TONE_COLOUR[line.tone];
}

function SupplyRing({ line }: { readonly line: SupplyLine }): ReactNode {
  const box = { width: RING_SIZE, height: RING_SIZE };
  return (
    <View className="min-w-0 flex-1 items-center gap-2">
      <View style={box} className="items-center justify-center">
        <View className="absolute inset-0">
          <Arc
            value={line.level ?? 0}
            size={RING_SIZE}
            thickness={10}
            colour={colourOf(line)}
            startAngle={-135}
            sweep={270}
            tinted
          />
        </View>
        <IconWell icon={ICON[line.kind]} colour={colourOf(line)} size="l" />
      </View>
      <View className="items-center">
        <Text variant="body-strong" numberOfLines={1}>
          {line.label}
        </Text>
        <Text
          variant="footnote"
          tone={line.tone === 'positive' ? 'variant' : line.tone}
          numberOfLines={1}
        >
          {line.text}
        </Text>
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {line.device}
        </Text>
      </View>
    </View>
  );
}

function rowsOf(lines: readonly SupplyLine[], columns: number): readonly (readonly SupplyLine[])[] {
  const rows: SupplyLine[][] = [];
  for (let index = 0; index < lines.length; index += columns) {
    rows.push(lines.slice(index, index + columns));
  }
  return rows;
}

function SupplyList({
  shown,
  more,
  columns,
  compact,
}: {
  readonly shown: readonly SupplyLine[];
  readonly more: number;
  readonly columns: number;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className="flex-1 justify-center gap-3">
      {rowsOf(shown, columns).map((row) => (
        <View key={row.map((line) => line.key).join()} className="flex-row gap-5">
          {row.map((line) => (
            <Line key={line.key} line={line} compact={compact} />
          ))}
          {row.length < columns ? <View className="flex-1" /> : null}
        </View>
      ))}
      {more > 0 ? <Text variant="footnote" tone="variant">{`${String(more)} more`}</Text> : null}
    </View>
  );
}

export function SuppliesWidget({
  size,
  room,
}: {
  readonly size: WidgetSize;
  readonly room: string | null;
}): ReactNode {
  const lines = useSupplies(room);
  const shown = lines.slice(0, SHOWN[size]);
  const more = lines.length - shown.length;
  const urgent = lines.some((line) => line.tone === 'critical');
  const columns = Math.min(size === 'W' || size === 'XL' ? 2 : 1, Math.max(1, shown.length));
  return (
    <WidgetFrame
      title="Filters & water"
      icon="wrench"
      accent={urgent ? 'critical' : 'positive'}
      glow={urgent ? 'critical' : null}
      size={size}
      href={href.devicesPage('supplies')}
    >
      {isTall(size) && shown.length <= RING_LINES ? (
        <View className="flex-1 flex-row items-center justify-around gap-4">
          {shown.map((line) => (
            <SupplyRing key={line.key} line={line} />
          ))}
        </View>
      ) : (
        <SupplyList shown={shown} more={more} columns={columns} compact={size === 'S'} />
      )}
    </WidgetFrame>
  );
}
