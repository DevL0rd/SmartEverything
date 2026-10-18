import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Overlay, useOverlayShown } from '../../../components/overlay';
import { Text } from '../../../components/text';
import { entering, useMotion } from '../../../design/motion';
import { modifierLabel, useIdiom } from '../../../design/platform';
import { useQuickAskKeys } from '../settings/quick-ask-shortcut';

function KeyChip({ keys }: { readonly keys: string }): ReactNode {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="rounded-xs border border-outline px-1.5 py-0.5"
    >
      <Text variant="caption" tone="variant">
        {keys}
      </Text>
    </View>
  );
}

function Hint({
  keys,
  spoken,
  label,
}: {
  readonly keys: string;
  readonly spoken: string;
  readonly label: string;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${spoken}, ${label}`}
      className="flex-row items-center gap-1"
    >
      <KeyChip keys={keys} />
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

function KeyHints(): ReactNode {
  const shortcut = useQuickAskKeys();
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pb-3">
      <Text variant="caption" tone="variant">
        {`Press ${shortcut} to open · change it in Settings → Assistant`}
      </Text>
      <View className="flex-row items-center gap-3">
        <Hint keys="⏎" spoken="Enter" label="Send" />
        <Hint
          keys={`${modifierLabel()} ⏎`}
          spoken={`${modifierLabel()} Enter`}
          label="Send and open"
        />
        <Hint keys="Esc" spoken="Escape" label="Close" />
      </View>
    </View>
  );
}

function Card({ children }: { readonly children: ReactNode }): ReactNode {
  const motion = useMotion();
  const shown = useOverlayShown();
  const pointer = useIdiom() === 'pointer';
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(250))}
      accessibilityViewIsModal
      aria-modal
      role="dialog"
      accessibilityLabel="Quick Ask"
      onLayout={shown}
      className="w-full max-w-dialog-wide rounded-lg border-hairline border-outline-variant bg-surface-raised elevation-3"
    >
      {children}
      {pointer ? <KeyHints /> : null}
    </Animated.View>
  );
}

export function QuickAskFrame({
  onClose,
  children,
}: {
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Overlay open onClose={onClose} label="Quick Ask" scrim className="items-center px-4">
      <View pointerEvents="none" className="w-full flex-1" />
      <Card>{children}</Card>
      <View pointerEvents="none" className="w-full flex-6" />
    </Overlay>
  );
}
