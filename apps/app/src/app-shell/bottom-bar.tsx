import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Interactive } from '../components/interactive';
import { useToastObstacle } from '../components/toast-obstacles';
import { navEntries, type NavEntry, type NavModel } from './nav-model';
import { NavItem } from './nav-item';
import { NavOrb } from './nav-orb';
import { useNavSheetPan } from './nav-sheet-gesture';
import { openNavSheet } from './nav-sheet-state';

export interface NavViewProps {
  readonly model: NavModel;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
}

function SheetHandle(): ReactNode {
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0 items-center">
      <Interactive
        role="button"
        label="Open navigation"
        hint="Swipe up on the bar to open"
        onPress={openNavSheet}
        className="h-6 w-32 items-center justify-center"
        layerClassName="rounded-full"
      >
        <View className="h-1 w-8 rounded-full bg-on-surface-faint" />
      </Interactive>
    </View>
  );
}

export function BottomBar({ model, go, intent }: NavViewProps): ReactNode {
  const pan = useNavSheetPan('bar');
  const { attach, onLayout } = useToastObstacle('bottom');
  const entries = navEntries(model);
  const middle = Math.ceil(entries.length / 2);
  const item = (entry: NavEntry): ReactNode => (
    <NavItem
      key={entry.route.key}
      entry={entry}
      look="bar"
      onPress={() => {
        go(entry);
      }}
      onIntent={() => {
        intent(entry);
      }}
    />
  );
  const orb = model.orb;
  return (
    <GestureDetector gesture={pan}>
      <View
        ref={attach}
        onLayout={onLayout}
        accessibilityRole="tablist"
        className="flex-row border-t border-outline-variant bg-chrome px-2 pb-safe pt-6"
      >
        <SheetHandle />
        {entries.slice(0, middle).map(item)}
        {orb === null ? null : (
          <NavOrb
            entry={orb}
            onPress={() => {
              go(orb);
            }}
            onIntent={() => {
              intent(orb);
            }}
          />
        )}
        {entries.slice(middle).map(item)}
      </View>
    </GestureDetector>
  );
}
