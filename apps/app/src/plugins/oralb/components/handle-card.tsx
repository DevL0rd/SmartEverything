import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import { PacerBar } from '../charts/pacer-bar';
import { tintStyle } from '../../toothbrush/charts/style';
import { useOralbConfig } from '../data/use-oralb';
import {
  COUNTERS_LOCKED,
  type Counter,
  countersOf,
  pacerBarOf,
  ringHex,
  ringText,
  seriesChip,
  slotsOf,
} from '../model/care-model';
import { probeStatus } from '../model/settings-model';
import { oralbModeOf } from '../model/wave-model';
import { ModeChip } from '../../toothbrush/components/mode-chip';
import { borderColorStyle, sizeStyle } from '../charts/style';

function Swatch({ hex }: { readonly hex: string | null }): ReactNode {
  const edge = useColour('outline');
  const unlit = useColour('surface-3');
  return (
    <View
      aria-hidden
      className="size-7 rounded-full border"
      style={[tintStyle(hex ?? unlit, hex === null ? 0.6 : 1), borderColorStyle(edge)]}
    />
  );
}

function Ring({ view }: { readonly view: BrushStateView }): ReactNode {
  const handle = view.handle.oralb;
  if (handle === null) {
    return null;
  }
  return (
    <View
      accessible
      accessibilityLabel={`SmartRing: ${ringText(handle)}`}
      className="flex-row items-center gap-3"
    >
      <Swatch hex={ringHex(handle.ringDisplay)} />
      <View className="min-w-0 flex-1">
        <Text variant="caption" tone="variant">
          SmartRing
        </Text>
        <Text variant="callout">{ringText(handle)}</Text>
      </View>
    </View>
  );
}

function Slots({ view }: { readonly view: BrushStateView }): ReactNode {
  const handle = view.handle.oralb;
  const slots = slotsOf(handle?.modeSlots ?? [], oralbModeOf(view.frame.mode));
  return (
    <View className="gap-1.5">
      <Text variant="caption" tone="variant">
        Modes on the handle, in order
      </Text>
      {slots.length === 0 ? (
        <Text variant="callout" tone="variant">
          Not read yet
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          {slots.map((slot) => (
            <View
              key={slot.mode}
              className={cn('rounded-full', slot.current && 'bg-surface-3 px-2')}
            >
              <ModeChip brand="oralb" mode={slot.mode} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Odometer({ counter }: { readonly counter: Counter }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${counter.label} ${counter.digits.join('')} ${counter.unit}`.trim()}
      className="flex-row items-center gap-2"
    >
      <Text variant="caption" tone="variant" className="w-32">
        {counter.label}
      </Text>
      <View aria-hidden className="flex-row gap-1">
        {counter.digits.map((digit, index) => (
          <View
            key={index}
            style={sizeStyle(28, 34)}
            className="items-center justify-center rounded-sm bg-surface-3"
          >
            <Text variant="body-strong" className="tabular">
              {digit}
            </Text>
          </View>
        ))}
      </View>
      {counter.unit === '' ? null : (
        <Text variant="caption" tone="variant">
          {counter.unit}
        </Text>
      )}
    </View>
  );
}

function Counters({
  view,
  unlocked,
}: {
  readonly view: BrushStateView;
  readonly unlocked: boolean;
}): ReactNode {
  const handle = view.handle.oralb;
  const counters = handle === null || !unlocked ? [] : countersOf(handle);
  if (counters.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        {COUNTERS_LOCKED}
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {counters.map((counter) => (
        <Odometer key={counter.label} counter={counter} />
      ))}
    </View>
  );
}

export function OralbHandleCard({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const { oralb } = useOralbConfig(deviceId);
  const handle = view.handle.oralb;
  if (handle === null) {
    return null;
  }
  const unlocked = probeStatus(oralb, 'history_select', handle.firmware) === 'passed';
  return (
    <Card title="Handle" icon="wrench">
      <View className="gap-4">
        <View className="flex-row flex-wrap gap-2">
          <Badge label={seriesChip(handle)} />
          <Badge label={oralb.model} />
        </View>
        <Ring view={view} />
        <Slots view={view} />
        <PacerBar bar={pacerBarOf(handle.pacer)} />
        <Counters view={view} unlocked={unlocked} />
      </View>
    </Card>
  );
}
