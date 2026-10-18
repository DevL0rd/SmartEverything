import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSeenLine } from '../detail/offline-banner';
import { lightStateLine } from '../model/light-state-line';
import { LightName } from './light-name';
import { RowPower } from './row-power';
import type { LightView } from './use-light';

export function LightDot({
  light,
  className,
}: {
  readonly light: LightView;
  readonly className: string;
}): ReactNode {
  const { state, colour } = light;
  const lit = state.online && state.power === 'on';
  const fill: ViewStyle | undefined =
    lit && colour !== null ? { backgroundColor: colour } : undefined;
  const look = !state.online
    ? 'border-2 border-dashed border-on-surface-variant'
    : lit
      ? colour === null
        ? 'bg-primary'
        : ''
      : 'border-2 border-on-surface-variant';
  return <View className={cn('rounded-full', look, className)} style={fill} aria-hidden />;
}

export function LightPower({ light }: { readonly light: LightView }): ReactNode {
  return (
    <RowPower device={light.device} icon="bulb" offline={!light.state.online} ring={light.colour} />
  );
}

function OfflineLine({
  light,
  short,
}: {
  readonly light: LightView;
  readonly short: boolean;
}): ReactNode {
  const seen = useSeenLine(light.device.id, false);
  return (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {seen === null ? 'Offline' : short ? `Offline · ${seen}` : `Offline · seen ${seen}`}
    </Text>
  );
}

const OFFLINE_REASON = 'Not responding. Check that it is plugged in and on Wi-Fi.';

export function OfflineReason(): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      {OFFLINE_REASON}
    </Text>
  );
}

export function LightLine({
  light,
  short = false,
  withLevel = true,
}: {
  readonly light: LightView;
  readonly short?: boolean;
  readonly withLevel?: boolean;
}): ReactNode {
  if (!light.state.online) {
    return <OfflineLine light={light} short={short} />;
  }
  if (light.failed) {
    return (
      <Text variant="footnote" tone="warning" numberOfLines={1}>
        Didn&apos;t respond
      </Text>
    );
  }
  return (
    <Text
      variant="footnote"
      tone={light.state.power === 'on' ? 'primary' : 'variant'}
      numberOfLines={1}
    >
      {lightStateLine({ ...light.state, seen: null }, withLevel)}
    </Text>
  );
}

export function LightNames({
  light,
  lines,
  short = false,
}: {
  readonly light: LightView;
  readonly lines: number;
  readonly short?: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5" pointerEvents="none">
      {lines === 1 ? (
        <LightName name={light.name} variant="body-strong" />
      ) : (
        <Text variant="body-strong" numberOfLines={lines}>
          {light.name}
        </Text>
      )}
      <LightLine light={light} short={short} />
    </View>
  );
}
