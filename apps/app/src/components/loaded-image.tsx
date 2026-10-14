import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASING, useMotion } from '../design/motion';
import { ImagePlaceholder } from './image-placeholder';

export function LoadedImage({
  url,
  label,
  resizeMode,
  onError,
}: {
  readonly url: string;
  readonly label: string;
  readonly resizeMode: 'contain' | 'cover';
  readonly onError: () => void;
}): ReactNode {
  const [loaded, setLoaded] = useState(false);
  const motion = useMotion();
  const opacity = useSharedValue(0);
  const reveal = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <View className="size-full">
      {loaded ? null : <ImagePlaceholder />}
      <Animated.View style={reveal} className="size-full">
        <Image
          source={{ uri: url }}
          resizeMode={resizeMode}
          accessibilityLabel={label}
          onError={onError}
          onLoad={() => {
            setLoaded(true);
            opacity.set(
              motion.reduced
                ? 1
                : withTiming(1, { duration: DURATION.medium, easing: EASING.standard }),
            );
          }}
          className="size-full"
        />
      </Animated.View>
    </View>
  );
}
