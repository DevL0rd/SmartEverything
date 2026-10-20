import type { SummaryTone } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BadgeTone } from '../../../components/badge';
import { Arc } from '../../../components/charts';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';

export const RING_ROLE: Readonly<Record<SummaryTone, ColourRole>> = {
  ok: 'positive',
  busy: 'primary',
  warn: 'warning',
  error: 'critical',
  asleep: 'on-surface-faint',
  paused: 'caution',
};

export const RING_BADGE: Readonly<Record<SummaryTone, BadgeTone>> = {
  ok: 'positive',
  busy: 'primary',
  warn: 'warning',
  error: 'critical',
  asleep: 'neutral',
  paused: 'warning',
};

export const RING_TONE: Readonly<Record<SummaryTone, Tone>> = {
  ok: 'positive',
  busy: 'primary',
  warn: 'warning',
  error: 'critical',
  asleep: 'faint',
  paused: 'warning',
};

export interface StateRingProps {
  readonly tone: SummaryTone;
  readonly progress: number | null;
  readonly title: string;
  readonly caption: string;
  readonly size?: number;
}

function legendOf(progress: number | null): string {
  return progress === null ? 'Ring shows the printer state' : 'Ring shows the job progress';
}

export function StateRing({
  tone,
  progress,
  title,
  caption,
  size = 112,
}: StateRingProps): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}. ${caption}. ${legendOf(progress)}`}
      className="items-center gap-1"
    >
      <View className="items-center justify-center">
        <Arc
          value={progress ?? 1}
          size={size}
          thickness={9}
          colour={RING_ROLE[tone]}
          trackColour="track"
        />
        <View className="absolute inset-x-0 items-center px-4">
          <Text
            variant={title.length > 10 ? 'body-strong' : 'title-3'}
            tone={RING_TONE[tone]}
            align="center"
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text variant="caption" tone="variant" align="center" numberOfLines={2}>
            {caption}
          </Text>
        </View>
      </View>
      <Text variant="caption" tone="faint" align="center">
        {legendOf(progress)}
      </Text>
    </View>
  );
}
