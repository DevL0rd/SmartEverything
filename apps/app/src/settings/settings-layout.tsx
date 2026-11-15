import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { screenPause } from '../app-shell/screen-pause';
import { SectionHost } from '../app-shell/section-host';
import { useStackOptions } from '../app-shell/tab-stack';
import { BuiltSettingsPages } from './availability';

export function SettingsLayout(): ReactNode {
  const options = useStackOptions();
  return (
    <BuiltSettingsPages>
      <SectionHost>
        <Stack screenLayout={screenPause} screenOptions={{ ...options, animation: 'none' }} />
      </SectionHost>
    </BuiltSettingsPages>
  );
}
