import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { ThemeScope } from '../../../design/theme-scope';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { playTime } from '../../../format/time';
import { eventLook } from '../../activity';
import type { TimelineKind } from '../logic/timeline';

export interface EventThumbProps {
  readonly uri: string | null;
  readonly kind: TimelineKind;
  readonly clipMs: number | null;
  readonly fill?: boolean;
}

function frameOf(fill: boolean, pointer: boolean): string {
  if (fill) {
    return 'w-full rounded-md';
  }
  return pointer ? 'w-20 rounded-sm' : 'w-24 rounded-md';
}

function KindChip({
  kind,
  fill,
}: {
  readonly kind: TimelineKind;
  readonly fill: boolean;
}): ReactNode {
  const look = eventLook(kind);
  return (
    <View
      accessible
      accessibilityLabel={look.label}
      className={cn(
        'absolute items-center justify-center rounded-full bg-black/60',
        fill ? 'left-1.5 top-1.5 size-7' : 'left-1 top-1 size-6',
      )}
    >
      <Icon name={look.icon} size={16} tone="default" />
    </View>
  );
}

function DurationPill({
  clipMs,
  fill,
}: {
  readonly clipMs: number;
  readonly fill: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'absolute rounded-xs bg-black/70',
        fill ? 'bottom-1 right-1 px-1.5 py-0.5' : 'bottom-1 right-1 px-1 py-px',
      )}
    >
      <Text variant="caption" className={fill ? '' : 'leading-none'}>
        {playTime(clipMs / 1000)}
      </Text>
    </View>
  );
}

export function EventThumb({ uri, kind, clipMs, fill = false }: EventThumbProps): ReactNode {
  const look = eventLook(kind);
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      className={cn(
        'aspect-video items-center justify-center overflow-hidden bg-surface-2',
        frameOf(fill, pointer),
      )}
    >
      {uri === null ? (
        <Icon name={look.icon} size={fill ? 32 : 20} tone={look.tone} />
      ) : (
        <Image
          resizeMethod="resize"
          source={{ uri }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          className="absolute inset-0 h-full w-full"
        />
      )}
      <ThemeScope theme="dark">
        {uri === null ? null : <KindChip kind={kind} fill={fill} />}
        {clipMs === null ? null : <DurationPill clipMs={clipMs} fill={fill} />}
      </ThemeScope>
    </View>
  );
}
