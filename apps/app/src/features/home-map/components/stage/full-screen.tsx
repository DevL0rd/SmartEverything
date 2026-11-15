import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Overlay, useOverlayShown } from '../../../../components/overlay';
import { PageShell } from '../../../../components/page-shell/page-shell';

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
      className="flex-1 bg-bg"
    >
      <PageShell
        variant="overlay"
        title={title}
        back={false}
        actions={[{ icon: 'minimize', label: 'Close full screen', onPress: onClose }]}
      >
        <View className="flex-1 px-2 pb-safe-offset-2 pt-safe-offset-14">{children}</View>
      </PageShell>
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
