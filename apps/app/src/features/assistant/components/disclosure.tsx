import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { DURATION, EASING, entering, exiting, useMotion } from '../../../design/motion';

export function CollapseRoot({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  const { reduced } = useMotion();
  return (
    <Animated.View
      {...(reduced
        ? {}
        : { layout: LinearTransition.duration(DURATION.mediumOut).easing(EASING.standard) })}
      {...(className === undefined ? {} : { className })}
    >
      {children}
    </Animated.View>
  );
}

export function CollapseBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(DURATION.mediumOut).easing(EASING.standard))}
      {...exiting(motion, FadeOut.duration(DURATION.short))}
      {...(className === undefined ? {} : { className })}
    >
      {children}
    </Animated.View>
  );
}

export function TurnChevron({ open }: { readonly open: boolean }): ReactNode {
  const { reduced } = useMotion();
  const angle = useSharedValue(open ? 180 : 0);
  useEffect(() => {
    const target = open ? 180 : 0;
    angle.set(
      reduced
        ? target
        : withTiming(target, { duration: DURATION.mediumOut, easing: EASING.standard }),
    );
  }, [open, reduced, angle]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${String(angle.get())}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="chevronDown" size={16} tone="variant" />
    </Animated.View>
  );
}
