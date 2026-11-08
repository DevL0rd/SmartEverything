import type { ReactElement } from 'react';
import { PageSettingsButton, Stage } from 'smarteverything-kit';

export const Default = (): ReactElement => (
  <Stage theme="dark" width={200}>
    <PageSettingsButton settings={{ href: '/settings/devices', label: 'Device settings' }} />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={200}>
    <PageSettingsButton settings={{ href: '/settings/devices', label: 'Device settings' }} />
  </Stage>
);
