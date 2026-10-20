import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { LIGHT_GUIDE, type LightMeaning } from '../model/light-guide';

function Row({ item }: { readonly item: LightMeaning }): ReactNode {
  const fill = { backgroundColor: useColour(item.colour) };
  return (
    <View className="min-h-touch-min flex-row items-center gap-3 py-1">
      <View style={fill} className="size-4 rounded-full" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong">{item.pattern}</Text>
        <Text variant="footnote" tone="variant">
          {item.meaning}
        </Text>
      </View>
    </View>
  );
}

export function LightGuide({ onPress }: { readonly onPress: () => void }): ReactNode {
  return (
    <Interactive
      role="button"
      label="What the light means"
      onPress={onPress}
      className="min-h-touch-min justify-center self-start"
    >
      <Text variant="footnote" tone="primary">
        What the light means
      </Text>
    </Interactive>
  );
}

export function LightSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="The light on the cap"
      label="The light on the cap"
      detents={['fit']}
    >
      <View className="gap-1 pb-4">
        {LIGHT_GUIDE.map((item) => (
          <Row key={`${item.colour}-${item.pattern}-${item.meaning}`} item={item} />
        ))}
      </View>
    </BottomSheet>
  );
}
