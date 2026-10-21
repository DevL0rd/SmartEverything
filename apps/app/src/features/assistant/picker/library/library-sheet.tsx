import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheet } from '../../../../components/bottom-sheet';
import { IconButton } from '../../../../components/icon-button';
import { Overlay, useOverlayShown } from '../../../../components/overlay';
import { Text } from '../../../../components/text';
import { entering, useMotion } from '../../../../design/motion';
import { useIdiom } from '../../../../design/platform';
import { dialogWidth } from './library-model';

export interface LibrarySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: string | null | undefined;
  readonly action?: ReactNode | undefined;
  readonly compact?: boolean;
  readonly children: (width: number) => ReactNode;
}

function Header({
  title,
  subtitle,
  action,
  onClose,
}: Pick<LibrarySheetProps, 'title' | 'subtitle' | 'action' | 'onClose'>): ReactNode {
  return (
    <View className="flex-row items-center gap-2 border-b border-outline-variant py-2 pl-5 pr-2">
      <View className="min-w-0 flex-1">
        <Text variant="title-3" accessibilityRole="header">
          {title}
        </Text>
        {subtitle === null || subtitle === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {subtitle}
          </Text>
        )}
      </View>
      {action}
      <IconButton icon="close" label="Close" onPress={onClose} shortcut="Esc" />
    </View>
  );
}

function Dialog(props: LibrarySheetProps): ReactNode {
  const motion = useMotion();
  const shown = useOverlayShown();
  const width = dialogWidth(useWindowDimensions().width);
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(250))}
      accessibilityViewIsModal
      aria-modal
      role="dialog"
      accessibilityLabel={props.title}
      onLayout={shown}
      className={`h-full max-h-190 w-full ${props.compact === true ? 'max-w-160' : 'max-w-240'} overflow-hidden rounded-xl bg-surface-raised elevation-3`}
    >
      <Header
        title={props.title}
        subtitle={props.subtitle}
        action={props.action}
        onClose={props.onClose}
      />
      {props.children(width)}
    </Animated.View>
  );
}

function PointerSheet(props: LibrarySheetProps): ReactNode {
  return (
    <Overlay
      open={props.open}
      onClose={props.onClose}
      label={props.title}
      scrim
      className="items-center justify-center p-6"
    >
      {props.open ? <Dialog {...props} /> : null}
    </Overlay>
  );
}

function TouchSheet(props: LibrarySheetProps): ReactNode {
  const { width } = useWindowDimensions();
  return (
    <BottomSheet
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      label={props.title}
      detents={['full']}
      scroll={false}
      {...(props.action === null || props.action === undefined ? {} : { footer: props.action })}
    >
      {props.open ? <View className="-mx-4 min-h-0 flex-1">{props.children(width)}</View> : null}
    </BottomSheet>
  );
}

export function LibrarySheet(props: LibrarySheetProps): ReactNode {
  const touch = useIdiom() === 'touch';
  return touch ? <TouchSheet {...props} /> : <PointerSheet {...props} />;
}
