import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { screenPause } from '../../app-shell/screen-pause';
import { SectionHost } from '../../app-shell/section-host';
import { useStackOptions } from '../../app-shell/tab-stack';
import { useShellRailShown } from '../../components/page-shell/rail-shown';

export function DeviceSettingsLayout(): ReactNode {
  const options = useStackOptions();
  const rail = useShellRailShown();
  return (
    <SectionHost>
      <Stack
        screenLayout={screenPause}
        screenOptions={rail ? { ...options, animation: 'none' } : options}
      />
    </SectionHost>
  );
}
