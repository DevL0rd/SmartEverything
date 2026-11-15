import type { PlannerColourKey } from '@smarteverything/domain';
import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { Icon, type IconName } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { LOOK_WORDS, type EventLook } from './calendars-model';

const EVENT_TINT: Readonly<Record<PlannerColourKey, string>> = {
  work: 'bg-viz-6/18',
  family: 'bg-viz-1/18',
  personal: 'bg-viz-3/20',
  health: 'bg-positive/18',
  home: 'bg-viz-4/18',
  shopping: 'bg-viz-5/18',
};

const EVENT_EDGE: Readonly<Record<PlannerColourKey, string>> = {
  work: 'border-viz-6',
  family: 'border-viz-1',
  personal: 'border-viz-3',
  health: 'border-positive',
  home: 'border-viz-4',
  shopping: 'border-viz-5',
};

const LOOK_ICON: Readonly<Partial<Record<EventLook, IconName>>> = {
  feed: 'globe',
  holiday: 'sun',
  birthday: 'party',
};

export function eventFill(
  colour: PlannerColourKey | null,
  proposed: boolean,
  look: EventLook,
): string {
  if (proposed) return 'border border-dashed border-primary bg-transparent';
  if (look === 'invited') {
    return cn(
      'border-2 bg-surface-1',
      colour === null ? 'border-on-surface-variant' : EVENT_EDGE[colour],
    );
  }
  return colour === null ? 'bg-surface-3' : EVENT_TINT[colour];
}

export function lookWords(look: EventLook): readonly string[] {
  const words = LOOK_WORDS[look];
  return words === null ? [] : [words];
}

export function LookMark({ look }: { readonly look: EventLook }): ReactNode {
  const icon = LOOK_ICON[look];
  return icon === undefined ? null : <Icon name={icon} size={16} tone="variant" />;
}

export function Hatch({ shown }: { readonly shown: boolean }): ReactNode {
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const stroke = useColour('on-surface-faint');
  if (!shown) return null;
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden rounded-sm">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id={id}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Line x1={0} y1={0} x2={0} y2={6} stroke={stroke} strokeWidth={1.5} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
