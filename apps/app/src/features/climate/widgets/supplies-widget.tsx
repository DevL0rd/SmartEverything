import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Arc, ProgressBar } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetFrame } from '../../../components/widget-board';
import type { ColourRole } from '../../../design/tokens';
import { useClimateSources } from '../model/climate-devices';
import { needsAttention, suppliesOf, type SupplyKind, type SupplyLine } from '../model/supplies';
import { rowsOf, supplyListFit, supplyRingFit, type RingFit } from './climate-fit';
import { useClimateBody } from './use-body-box';

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

function Line({ line }: { readonly line: SupplyLine }): ReactNode {
  const colour = colourOf(line);
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      <IconWell icon={ICON[line.kind]} colour={colour} size="m" />
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

function colourOf(line: SupplyLine): ColourRole {
  return line.kind === 'water' && line.tone === 'positive' ? 'humidity' : TONE_COLOUR[line.tone];
}

function SupplyRing({
  line,
  fit,
}: {
  readonly line: SupplyLine;
  readonly fit: RingFit;
}): ReactNode {
  const box = { width: fit.ring, height: fit.ring };
  return (
    <View className="min-w-0 flex-1 items-center gap-2">
      <View style={box} className="items-center justify-center">
        <View className="absolute inset-0">
          <Arc
            value={line.level ?? 0}
            size={fit.ring}
            thickness={fit.thickness}
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

function SupplyList({ lines }: { readonly lines: readonly SupplyLine[] }): ReactNode {
  const fit = supplyListFit(useClimateBody().box, lines.length);
  return (
    <View className="flex-1 gap-3">
      {rowsOf(lines.slice(0, fit.shown), fit.columns).map((row) => (
        <View key={row.map((line) => line.key).join()} className="flex-row gap-5">
          {row.map((line) => (
            <Line key={line.key} line={line} />
          ))}
          {Array.from({ length: fit.columns - row.length }, (_, index) => (
            <View key={`gap-${String(index)}`} className="min-w-0 flex-1" />
          ))}
        </View>
      ))}
      {fit.more > 0 ? (
        <Text variant="footnote" tone="variant">{`${String(fit.more)} more`}</Text>
      ) : null}
    </View>
  );
}

function Supplies({ lines }: { readonly lines: readonly SupplyLine[] }): ReactNode {
  const ring = supplyRingFit(useClimateBody().box, lines.length);
  if (ring === null) {
    return <SupplyList lines={lines} />;
  }
  return (
    <View className="flex-1 flex-row items-start justify-around gap-4">
      {lines.map((line) => (
        <SupplyRing key={line.key} line={line} fit={ring} />
      ))}
    </View>
  );
}

export function SuppliesWidget({ room }: { readonly room: string | null }): ReactNode {
  const lines = useSupplies(room);
  const urgent = lines.some((line) => line.tone === 'critical');
  return (
    <WidgetFrame
      title="Filters & water"
      icon="wrench"
      accent={urgent ? 'critical' : 'positive'}
      glow={urgent ? 'critical' : null}
      href={href.devicesPage('supplies')}
    >
      <Supplies lines={lines} />
    </WidgetFrame>
  );
}
