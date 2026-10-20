import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { percent } from '../../../format/number';
import type { ColourRole } from '../../../design/tokens';
import { useColour } from '../../../design/colour';
import type { MixSegment } from '../model/stats-model';
import { fillStyle, tintStyle } from './style';

function Segment({
  share,
  colour,
  opacity,
}: {
  readonly share: number;
  readonly colour: ColourRole;
  readonly opacity: number;
}): ReactNode {
  const fill = useColour(colour);
  return <View style={fillStyle(share, fill, opacity)} />;
}

function Swatch({
  colour,
  opacity,
}: {
  readonly colour: ColourRole;
  readonly opacity: number;
}): ReactNode {
  const fill = useColour(colour);
  return <View className="size-2.5 rounded-xs" style={tintStyle(fill, opacity)} />;
}

export function MixBar({
  segments,
  title,
}: {
  readonly segments: readonly MixSegment[];
  readonly title: string;
}): ReactNode {
  if (segments.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        Nothing yet
      </Text>
    );
  }
  const summary = segments
    .map((segment) => `${segment.label} ${percent(segment.share)}`)
    .join(', ');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${title}: ${summary}`}
      className="gap-2"
    >
      <View className="h-4 flex-row gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <Segment
            key={segment.key}
            share={segment.share}
            colour={segment.colour}
            opacity={segment.opacity}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <View key={segment.key} className="flex-row items-center gap-1.5">
            <Swatch colour={segment.colour} opacity={segment.opacity} />
            <Text variant="caption" tone="variant" className="tabular">
              {segment.label} {percent(segment.share)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
