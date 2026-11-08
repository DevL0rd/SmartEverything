import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { bringIntoView } from '../../../components/bring-into-view';
import { useScreen } from '../../../components/screen-context';

export function RevealBox({
  seq,
  onRevealed,
  children,
}: {
  readonly seq: number | null;
  readonly onRevealed: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useAnimatedRef<Animated.View>();
  const { scrollRef, scrollY } = useScreen();
  const laidOut = useRef(false);
  const pending = useRef(false);
  const reveal = (): void => {
    pending.current = false;
    if (scrollRef !== null) {
      scheduleOnUI(bringIntoView, ref, scrollRef, scrollY);
    }
    onRevealed();
  };
  const requested = useEffectEvent(() => {
    if (laidOut.current) {
      reveal();
    } else {
      pending.current = true;
    }
  });
  useEffect(() => {
    if (seq !== null) {
      requested();
    }
  }, [seq]);
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      onLayout={() => {
        laidOut.current = true;
        if (pending.current) {
          reveal();
        }
      }}
    >
      {children}
    </Animated.View>
  );
}
