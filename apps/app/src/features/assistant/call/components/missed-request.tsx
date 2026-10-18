import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Banner } from '../../../../components/banner';
import { entering, useMotion } from '../../../../design/motion';
import { changeCall, type CallMissed } from '../call-state';
import { missedLeftMs, missedTitle } from '../model/call-missed';

export interface MissedRequestProps {
  readonly missed: CallMissed;
  readonly name: string;
  readonly onShow: () => void;
}

function clear(): void {
  changeCall(() => ({ missed: null }));
}

export function MissedRequest({ missed, name, onShow }: MissedRequestProps): ReactNode {
  const motion = useMotion();
  useEffect(() => {
    const timer = setTimeout(clear, missedLeftMs(missed, Date.now()));
    return (): void => {
      clearTimeout(timer);
    };
  }, [missed]);
  return (
    <Animated.View {...entering(motion, FadeInUp)} className="w-full max-w-call">
      <Banner
        tone="info"
        title={missedTitle(name, missed)}
        action={{ label: 'Show now', onPress: onShow }}
        onDismiss={clear}
      />
    </Animated.View>
  );
}
