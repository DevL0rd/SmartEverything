import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useColour } from '../design/colour';
import type { ColourRole } from '../design/tokens';
import { Icon, type IconName } from './icon';

type IconWellSize = 's' | 'm' | 'l';

const WELL: Readonly<Record<IconWellSize, string>> = {
  s: 'size-7 rounded-sm',
  m: 'size-9 rounded-md',
  l: 'size-12 rounded-lg',
};

const GLYPH: Readonly<Record<IconWellSize, 16 | 20 | 24>> = { s: 16, m: 20, l: 24 };

export interface IconWellProps {
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly size?: IconWellSize;
}

export function IconWell({ icon, colour, size = 'm' }: IconWellProps): ReactNode {
  const tint = { backgroundColor: useColour(colour), opacity: 0.16 };
  return (
    <View aria-hidden className={cn('items-center justify-center overflow-hidden', WELL[size])}>
      <View style={tint} className="absolute inset-0" />
      <Icon name={icon} size={GLYPH[size]} colour={colour} />
    </View>
  );
}
