import { createContext, useContext } from 'react';
import type Animated from 'react-native-reanimated';
import { makeMutable, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { inertViewport, type ViewportRegistry } from '../design/viewport-registry';
import type { PrimaryActionProps } from './primary-action';

export type HeaderSlot = 'bar' | 'large';

export interface ScreenValue {
  readonly scrollable: boolean;
  readonly scrollY: SharedValue<number>;
  readonly scrollRef: AnimatedRef<Animated.ScrollView> | null;
  readonly primaryAction: PrimaryActionProps | null;
  readonly viewport: ViewportRegistry;
}

const IDLE: ScreenValue = {
  scrollable: false,
  scrollY: makeMutable(0),
  scrollRef: null,
  primaryAction: null,
  viewport: inertViewport(),
};

export const ScreenContext = createContext<ScreenValue>(IDLE);

export const HeaderSlotContext = createContext<HeaderSlot>('bar');

export function useScreen(): ScreenValue {
  return useContext(ScreenContext);
}

export function useHeaderSlot(): HeaderSlot {
  return useContext(HeaderSlotContext);
}
