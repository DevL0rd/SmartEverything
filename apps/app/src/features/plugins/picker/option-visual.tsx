import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { PluginOption } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { initialsOf } from '../../../format/text';

const FILL = ['bg-viz-1', 'bg-viz-2', 'bg-viz-3', 'bg-viz-4', 'bg-viz-5', 'bg-viz-6'] as const;

const SIZE = { s: 'size-8', m: 'size-10' } as const;

const DOT = { s: 14, m: 18 } as const;

function slotOf(text: string): number {
  let sum = 0;
  for (let at = 0; at < text.length; at += 1) {
    sum += text.charCodeAt(at);
  }
  return sum % FILL.length;
}

export function OptionVisual({
  option,
  size = 'm',
}: {
  readonly option: Pick<PluginOption, 'id' | 'label' | 'color' | 'image'>;
  readonly size?: keyof typeof SIZE;
}): ReactNode {
  const frame = cn('items-center justify-center overflow-hidden rounded-full', SIZE[size]);
  if (option.image !== null) {
    return (
      <View accessibilityElementsHidden className={cn(frame, 'bg-surface-3')}>
        <Image source={{ uri: option.image }} className="size-full" />
      </View>
    );
  }
  if (option.color !== null) {
    const dot = DOT[size];
    return (
      <View accessibilityElementsHidden className={cn(frame, 'bg-surface-3')}>
        <Svg width={dot} height={dot} viewBox="0 0 2 2">
          <Circle cx={1} cy={1} r={1} fill={option.color} />
        </Svg>
      </View>
    );
  }
  return (
    <View accessibilityElementsHidden className={cn(frame, FILL[slotOf(option.label)] ?? FILL[0])}>
      <Text variant="label" tone="onPrimary">
        {initialsOf(option.label.replace(/^[#@]/, ''))}
      </Text>
    </View>
  );
}
