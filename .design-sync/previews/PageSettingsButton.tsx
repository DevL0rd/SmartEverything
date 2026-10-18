import { PageSettingsButton, Stage } from 'smarteverything-kit';

export const Default = () => (
  <Stage theme="dark" width={200}>
    <PageSettingsButton settings={{ href: '/settings/devices', label: 'Device settings' }} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={200}>
    <PageSettingsButton settings={{ href: '/settings/devices', label: 'Device settings' }} />
  </Stage>
);
