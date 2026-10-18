import type { ReactNode } from 'react';
import { createElement, memo } from 'react';
import { useColour } from '../design/colour';
import type { ColourRole } from '../design/tokens';
import { GLYPHS, type IconName } from './icon-glyphs';
import { TONE_ROLE, type Tone } from './tone';

export type { IconName } from './icon-glyphs';
export { isIconName } from './icon-glyphs';

type IconSize = 16 | 20 | 24 | 32 | 40;

export interface IconProps {
  readonly name: IconName;
  readonly size?: IconSize;
  readonly tone?: Tone;
  readonly colour?: ColourRole;
}

export const Icon = memo(function Icon({
  name,
  size = 20,
  tone = 'variant',
  colour,
}: IconProps): ReactNode {
  const color = useColour(colour ?? TONE_ROLE[tone]);
  return createElement(GLYPHS[name], {
    size,
    strokeWidth: size === 16 ? 2 : 1.75,
    color,
    'aria-hidden': true,
  });
});
