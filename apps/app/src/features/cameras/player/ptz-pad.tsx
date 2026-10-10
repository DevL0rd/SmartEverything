import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Icon, type IconName } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import type { Ptz, PtzDirection } from './use-ptz';

interface PadKey {
  readonly direction: PtzDirection;
  readonly icon: IconName;
  readonly label: string;
  readonly place: string;
}

const KEYS: readonly PadKey[] = [
  { direction: 'up', icon: 'chevronUp', label: 'Tilt up', place: 'left-1/3 top-0' },
  { direction: 'left', icon: 'chevronLeft', label: 'Turn left', place: 'left-0 top-1/3' },
  { direction: 'right', icon: 'chevronRight', label: 'Turn right', place: 'right-0 top-1/3' },
  { direction: 'down', icon: 'chevronDown', label: 'Tilt down', place: 'bottom-0 left-1/3' },
];

function HoldKey({ pad, ptz }: { readonly pad: PadKey; readonly ptz: Ptz }): ReactNode {
  const hold = Gesture.LongPress()
    .minDuration(0)
    .maxDistance(10_000)
    .runOnJS(true)
    .onStart(() => {
      selectionTick();
      ptz.hold(pad.direction);
    })
    .onFinalize(() => {
      ptz.hold(null);
    });
  return (
    <GestureDetector gesture={hold}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={pad.label}
        accessibilityHint="Hold to keep moving"
        className={cn(
          'absolute size-1/3 items-center justify-center rounded-full',
          pad.place,
          ptz.moving === pad.direction ? 'bg-primary' : 'bg-transparent',
        )}
      >
        <Icon
          name={pad.icon}
          size={24}
          tone={ptz.moving === pad.direction ? 'onPrimary' : 'default'}
        />
      </View>
    </GestureDetector>
  );
}

function HomeKey({ ptz }: { readonly ptz: Ptz }): ReactNode {
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      selectionTick();
      ptz.step('home');
    });
  return (
    <GestureDetector gesture={tap}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Home position"
        className="absolute left-1/3 top-1/3 size-1/3 items-center justify-center rounded-full bg-white/16"
      >
        <Icon name="home" size={20} />
      </View>
    </GestureDetector>
  );
}

export type PadSize = 'small' | 'medium' | 'large';

const PAD_SIZE: Readonly<Record<PadSize, string>> = {
  small: 'size-28',
  medium: 'size-32',
  large: 'size-40',
};

export function PtzPad({ ptz, size }: { readonly ptz: Ptz; readonly size: PadSize }): ReactNode {
  if (!ptz.supported) {
    return null;
  }
  return (
    <View
      accessibilityLabel="Pan and tilt"
      className={cn('rounded-full bg-black/40', PAD_SIZE[size])}
    >
      {KEYS.map((pad) => (
        <HoldKey key={pad.direction} pad={pad} ptz={ptz} />
      ))}
      <HomeKey ptz={ptz} />
    </View>
  );
}
