import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { cn } from '../../../design/cn';
import { initialsOf } from '../../../format/text';
import { paletteSlotOf } from '../model/speaker';

const FILL = ['bg-viz-1', 'bg-viz-2', 'bg-viz-3', 'bg-viz-4', 'bg-viz-5', 'bg-viz-6'] as const;

const INK = [
  'text-viz-1',
  'text-viz-2',
  'text-viz-3',
  'text-viz-4',
  'text-viz-5',
  'text-viz-6',
] as const;

const SIZE = { s: 'size-5', m: 'size-7' } as const;

const LETTER = { s: 'text-caption', m: 'text-label' } as const;

export function speakerInk(name: string): string {
  return INK[paletteSlotOf(name) - 1] ?? INK[0];
}

export function SpeakerAvatar({
  name,
  size = 'm',
}: {
  readonly name: string;
  readonly size?: keyof typeof SIZE;
}): ReactNode {
  const slot = paletteSlotOf(name) - 1;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('items-center justify-center rounded-full', SIZE[size], FILL[slot] ?? FILL[0])}
    >
      <NativeText className={cn('font-sans-semibold text-bg', LETTER[size])}>
        {initialsOf(name).slice(0, 1)}
      </NativeText>
    </View>
  );
}
