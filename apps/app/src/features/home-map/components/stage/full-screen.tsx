import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../../components/overlay';
import { Text } from '../../../../components/text';

export const FULL_SCREEN_LABEL = 'Full screen map';

export interface StageFullScreenProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

function Screen({ title, onClose, children }: StageFullScreenProps): ReactNode {
  const shown = useOverlayShown();
  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={FULL_SCREEN_LABEL}
      onLayout={shown}
      className="flex-1 gap-2 bg-bg px-2 pb-safe-offset-2 pt-safe-offset-2"
    >
      <View className="flex-row items-center gap-2">
        <IconButton icon="minimize" label="Close full screen" onPress={onClose} />
        <Text variant="body-strong" accessibilityRole="header" numberOfLines={1} className="shrink">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function StageFullScreen(props: StageFullScreenProps): ReactNode {
  return (
    <Overlay open onClose={props.onClose} label={FULL_SCREEN_LABEL} scrim={false}>
      <Screen {...props} />
    </Overlay>
  );
}
