import type { ZoneSource } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ZoneBars as ZoneBarsModel } from '../model/stats-model';
import { secondsText } from '../model/brush-model';
import { ZONE_TEXT } from '../model/zone-text';
import { flexStyle } from './style';

function Bar({ share }: { readonly share: number }): ReactNode {
  const fill = useColour('primary');
  return (
    <View className="h-3 flex-1 flex-row overflow-hidden rounded-full bg-surface-2">
      <View style={flexStyle(share, fill)} />
      <View style={flexStyle(Math.max(0, 1 - share))} />
    </View>
  );
}

export function ZoneBars({
  model,
  source,
}: {
  readonly model: ZoneBarsModel;
  readonly source: ZoneSource;
}): ReactNode {
  if (model.bars.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        This mode has no zones to compare.
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {model.bars.map((bar) => (
        <View
          key={bar.zone}
          accessible
          accessibilityLabel={`${bar.name}, ${secondsText(bar.seconds)}`}
          className="flex-row items-center gap-3"
        >
          <Text variant="caption" tone="variant" className="w-24" numberOfLines={1}>
            {bar.name}
          </Text>
          <Bar share={bar.share} />
          <Text variant="caption" tone="faint" className="w-14 text-right tabular">
            {secondsText(bar.seconds)}
          </Text>
        </View>
      ))}
      <Text variant="footnote" tone="variant">
        {ZONE_TEXT[source].bars}
      </Text>
    </View>
  );
}
