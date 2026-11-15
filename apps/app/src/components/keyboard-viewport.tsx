import { use, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardRootContext, LiftedContext } from './keyboard-contexts';
import Animated, {
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedRef,
} from 'react-native-reanimated';
import {
  useKeyboardHandler,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import { scheduleOnRN } from 'react-native-worklets';
import { Logger } from '@smarteverything/logging';
import { keyboardLift, liftReport, type LiftReport } from './keyboard-lift';

const log = new Logger('app.keyboard');

function reportLift(report: LiftReport): void {
  if (report.covered !== null && report.covered > 0) {
    log.warn('keyboard.lift_short', { ...report });
    return;
  }
  log.debug('keyboard.lift_settled', () => ({ ...report }));
}

type RootRef = AnimatedRef<Animated.View>;

class KeyboardRootMissingError extends Error {
  override readonly name = 'KeyboardRootMissingError';

  constructor() {
    super('A KeyboardViewport needs a KeyboardRoot around it to know where the window ends.');
  }
}

export function KeyboardRoot({ children }: { readonly children: ReactNode }): ReactNode {
  const ref = useAnimatedRef<Animated.View>();
  return (
    <KeyboardRootContext value={ref}>
      <LiftedContext value={false}>
        <Animated.View ref={ref} collapsable={false} className="flex-1">
          {children}
        </Animated.View>
      </LiftedContext>
    </KeyboardRootContext>
  );
}

interface KeyboardViewportProps {
  readonly className: string;
  readonly children: ReactNode;
}

function LiftedViewport({
  root,
  className,
  children,
}: KeyboardViewportProps & { readonly root: RootRef }): ReactNode {
  const ref = useAnimatedRef<Animated.View>();
  const { height } = useReanimatedKeyboardAnimation();
  const laidOut = useSharedValue(0);
  const lift = useSharedValue(0);
  useAnimatedReaction(
    () => ({ keyboard: -height.get(), layout: laidOut.get() }),
    ({ keyboard }) => {
      lift.set(keyboard > 0 ? keyboardLift(keyboard, measure(ref), measure(root)) : 0);
    },
  );
  useKeyboardHandler(
    {
      onEnd: (event) => {
        'worklet';
        const keyboard = event.height;
        const view = measure(ref);
        const frame = measure(root);
        const applied = keyboard > 0 ? keyboardLift(keyboard, view, frame) : 0;
        scheduleOnRN(reportLift, liftReport(keyboard, view, frame, applied));
      },
    },
    [],
  );
  const style = useAnimatedStyle(() => ({ paddingBottom: lift.get() }));
  return (
    <LiftedContext value>
      <Animated.View
        ref={ref}
        collapsable={false}
        onLayout={() => {
          laidOut.set(laidOut.get() + 1);
        }}
        style={style}
        className={className}
      >
        {children}
      </Animated.View>
    </LiftedContext>
  );
}

export function KeyboardViewport({ className, children }: KeyboardViewportProps): ReactNode {
  const lifted = use(LiftedContext);
  const root = use(KeyboardRootContext);
  if (lifted) {
    return <View className={className}>{children}</View>;
  }
  if (root === null) {
    throw new KeyboardRootMissingError();
  }
  return (
    <LiftedViewport root={root} className={className}>
      {children}
    </LiftedViewport>
  );
}
