import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useEscape } from '../components/use-escape';
import { useValue } from '../design/external-store';
import { useMotion } from '../design/motion';
import { isNative } from '../design/platform';
import { registerSheetSearch } from '../search/open-search';
import { NavSheetBody } from './nav-sheet-body';
import {
  closeNavSheet,
  navSheetLift,
  navSheetPhase,
  navSheetQuery,
  navSheetReduced,
  navSheetStops,
  searchInNavSheet,
  settleNavSheet,
  type NavSheetStops,
} from './nav-sheet-state';

const HALF_SHARE = 0.55;
const TOP_GAP = 8;

function useSheetStops(): NavSheetStops {
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const { reduced } = useMotion();
  const stops = {
    half: Math.round(height * HALF_SHARE),
    full: height - top - TOP_GAP,
  };
  useEffect(() => {
    navSheetStops.set({ half: stops.half, full: stops.full });
    navSheetReduced.set(reduced);
    settleNavSheet(navSheetPhase.get(), 0);
  }, [stops.half, stops.full, reduced]);
  return stops;
}

function useSheetLifecycle(): void {
  const open = useValue(navSheetPhase) !== 'closed';
  useEscape(open, closeNavSheet);
  useEffect(() => {
    if (!open || !isNative()) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeNavSheet();
      return true;
    });
    return (): void => {
      subscription.remove();
    };
  }, [open]);
  useEffect(() => registerSheetSearch(searchInNavSheet), []);
  useEffect(
    () => (): void => {
      navSheetPhase.set('closed');
      navSheetLift.set(0);
    },
    [],
  );
}

function useShown(): boolean {
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => navSheetLift.get() > 0.5,
    (now, before) => {
      if (now !== before) {
        scheduleOnRN(setShown, now);
      }
    },
  );
  useEffect(() => {
    if (!shown) {
      navSheetQuery.set('');
    }
  }, [shown]);
  return shown;
}

function Panel({ stops }: { readonly stops: NavSheetStops }): ReactNode {
  const scrim = useAnimatedStyle(() => ({
    opacity: interpolate(navSheetLift.get(), [0, stops.half], [0, 1], 'clamp'),
  }));
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: stops.full - navSheetLift.get() }],
  }));
  return (
    <View pointerEvents="box-none" className="absolute inset-0">
      <Animated.View style={scrim} className="absolute inset-0 bg-scrim">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close navigation"
          onPress={closeNavSheet}
          className="flex-1"
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        aria-modal
        accessibilityLabel="Navigation"
        style={[{ height: stops.full }, slide]}
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-xxl bg-surface-raised elevation-3"
      >
        <KeyboardAvoidingView behavior={isNative() ? 'padding' : undefined} className="flex-1">
          <NavSheetBody stops={stops} />
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

export function NavSheetHost(): ReactNode {
  const stops = useSheetStops();
  useSheetLifecycle();
  const shown = useShown();
  return shown ? <Panel stops={stops} /> : null;
}
