import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { screenPause } from '../app-shell/screen-pause';
import { useStackOptions } from '../app-shell/tab-stack';
import { BuiltSettingsPages } from './availability';
import { useSettingsRail } from './settings-nav';

export function SettingsLayout(): ReactNode {
  const rail = useSettingsRail();
  const options = useStackOptions();
  return (
    <BuiltSettingsPages>
      <Stack
        screenLayout={screenPause}
        screenOptions={rail ? { ...options, animation: 'none' } : options}
      />
    </BuiltSettingsPages>
  );
}
