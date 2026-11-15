import { createContext } from 'react';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';

export const KeyboardRootContext = createContext<AnimatedRef<Animated.View> | null>(null);

export const LiftedContext = createContext(false);
