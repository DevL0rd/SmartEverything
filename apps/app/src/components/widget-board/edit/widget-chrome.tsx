import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { Icon, type IconName } from '../../icon';
import { Interactive } from '../../interactive';
import { Text } from '../../text';

type Corner = 'top-left' | 'top-right' | 'bottom-right';

const CORNER: Readonly<Record<'touch' | 'pointer', Readonly<Record<Corner, string>>>> = {
  touch: {
    'top-left': '-left-3 -top-3 size-12',
    'top-right': '-right-3 -top-3 size-12',
    'bottom-right': '-bottom-3 -right-3 size-12',
  },
  pointer: {
    'top-left': '-left-2 -top-2 size-8',
    'top-right': '-right-2 -top-2 size-8',
    'bottom-right': '-bottom-2 -right-2 size-8',
  },
};

function Knob({ icon }: { readonly icon: IconName }): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <View
      className={cn(
        'items-center justify-center rounded-full border-hairline border-outline bg-surface-raised elevation-2',
        touch ? 'size-9' : 'size-7',
      )}
    >
      <Icon name={icon} size={16} tone="default" />
    </View>
  );
}

export function CornerButton({
  corner,
  icon,
  label,
  onPress,
}: {
  readonly corner: Corner;
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  const idiom = useIdiom();
  return (
    <View className={cn('absolute z-20', CORNER[idiom][corner])}>
      <Interactive
        label={label}
        onPress={onPress}
        className="size-full items-center justify-center rounded-full"
        layerClassName="rounded-full"
      >
        <Knob icon={icon} />
      </Interactive>
    </View>
  );
}

export function ResizeHandle({
  gesture,
  label,
}: {
  readonly gesture: PanGesture;
  readonly label: string;
}): ReactNode {
  const idiom = useIdiom();
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityLabel={label}
        className={cn(
          'absolute z-20 cursor-nwse-resize items-center justify-center',
          CORNER[idiom]['bottom-right'],
        )}
      >
        <Knob icon="resize" />
      </View>
    </GestureDetector>
  );
}

export function SizeLabel({ label }: { readonly label: string }): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-0 z-10 items-center justify-center">
      <View className="rounded-full bg-primary px-4 py-2 elevation-2">
        <Text variant="label" tone="onPrimary">
          {label}
        </Text>
      </View>
    </View>
  );
}
