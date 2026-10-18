import type { ReactNode } from 'react';
import { useEffect, useEffectEvent } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SIGHT_REQUEST_TIMEOUT_MS } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { entering, useMotion } from '../../../../design/motion';
import type { CallSightRequest } from '../call-state';
import { useFocusFirst } from './use-focus-first';
import { consentAccept, consentTitle } from '../model/call-copy';

export interface ConsentBannerProps {
  readonly request: CallSightRequest;
  readonly name: string;
  readonly onAnswer: (accepted: boolean) => void;
  readonly onExpire: () => void;
}

function Countdown({ onElapsed }: { readonly onElapsed: () => void }): ReactNode {
  const motion = useMotion();
  const remaining = useSharedValue(1);
  const elapsed = useEffectEvent(onElapsed);
  useEffect(() => {
    if (!motion.reduced) {
      remaining.set(withTiming(0, { duration: SIGHT_REQUEST_TIMEOUT_MS, easing: Easing.linear }));
    }
    const timer = setTimeout(elapsed, SIGHT_REQUEST_TIMEOUT_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [motion.reduced, remaining]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: remaining.get() }] }));
  return (
    <View
      accessible
      accessibilityLabel={`Declines in ${String(SIGHT_REQUEST_TIMEOUT_MS / 1000)} seconds`}
      className="h-1 overflow-hidden rounded-full bg-surface-3"
    >
      <Animated.View style={style} className="h-1 w-full origin-left rounded-full bg-primary" />
    </View>
  );
}

export function ConsentBanner({
  request,
  name,
  onAnswer,
  onExpire,
}: ConsentBannerProps): ReactNode {
  const motion = useMotion();
  const focus = useFocusFirst();
  return (
    <Animated.View
      {...entering(motion, FadeInUp)}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      className="w-full max-w-call gap-3 rounded-xl border-hairline border-outline-variant bg-surface-raised p-4 elevation-2"
    >
      <View className="flex-row items-start gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-primary-container">
          <Icon name="eye" size={20} tone="primary" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong">{consentTitle(name, request.what, request.target)}</Text>
          {request.why === '' ? null : (
            <Text variant="callout" tone="variant">
              {request.why}
            </Text>
          )}
        </View>
      </View>
      <View className="flex-row gap-3" ref={focus}>
        <Button
          label={consentAccept(request.what)}
          grow
          onPress={() => {
            onAnswer(true);
          }}
        />
        <Button
          label="Not now"
          variant="outlined"
          grow
          onPress={() => {
            onAnswer(false);
          }}
        />
      </View>
      <Countdown onElapsed={onExpire} />
    </Animated.View>
  );
}
