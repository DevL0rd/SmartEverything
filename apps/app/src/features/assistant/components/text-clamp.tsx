import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { EASING, useMotion } from '../../../design/motion';
import type { ColourRole } from '../../../design/tokens';
import { CLAMP_LINES } from '../model/message-text';
import { RISE_MS } from './thread-motion';

const LINE_PX = 22;

const SLACK_PX = 8;

const LIMIT_PX = LINE_PX * CLAMP_LINES;

function FadeLayer({ role }: { readonly role: ColourRole }): ReactNode {
  const id = `clamp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const colour = useColour(role);
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colour} stopOpacity={0} />
            <Stop offset="1" stopColor={colour} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function Fade({ fades }: { readonly fades: readonly ColourRole[] }): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-14">
      {fades.map((role) => (
        <FadeLayer key={role} role={role} />
      ))}
    </View>
  );
}

function Toggle({
  open,
  onPress,
}: {
  readonly open: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const label = open ? 'Show less' : 'Show more';
  return (
    <Interactive
      label={label}
      onPress={onPress}
      className="min-h-touch-min justify-center self-start rounded-sm"
      layerClassName="rounded-sm"
    >
      <Text variant="label" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

export function TextClamp({
  fades,
  children,
}: {
  readonly fades: readonly ColourRole[];
  readonly children: ReactNode;
}): ReactNode {
  const { reduced } = useMotion();
  const [full, setFull] = useState(0);
  const [open, setOpen] = useState(false);
  const long = full > LIMIT_PX + SLACK_PX;
  const progress = useSharedValue(0);
  useEffect(() => {
    const target = open ? 1 : 0;
    progress.set(
      reduced ? target : withTiming(target, { duration: RISE_MS.send, easing: EASING.standard }),
    );
  }, [open, reduced, progress]);
  const style = useAnimatedStyle(() =>
    long ? { maxHeight: LIMIT_PX + progress.get() * (full - LIMIT_PX), overflow: 'hidden' } : {},
  );
  return (
    <View>
      <Animated.View style={style}>
        <View
          onLayout={(event) => {
            setFull(event.nativeEvent.layout.height);
          }}
        >
          {children}
        </View>
        {long && !open ? <Fade fades={fades} /> : null}
      </Animated.View>
      {long ? (
        <Toggle
          open={open}
          onPress={() => {
            setOpen(!open);
          }}
        />
      ) : null}
    </View>
  );
}
