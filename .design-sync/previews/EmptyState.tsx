import type { ReactElement } from 'react';
import { Button, EmptyState, Stage } from 'smarteverything-kit';

export const NoDevices = (): ReactElement => (
  <Stage theme="dark" width={460}>
    <EmptyState
      icon="plug"
      title="No devices yet"
      body="Connect Xiaomi, SmartThings or Tuya to bring your devices into one place."
      action={<Button label="Connect a service" icon="plus" />}
    />
  </Stage>
);
export const NoAlerts = (): ReactElement => (
  <Stage theme="dark" width={460}>
    <EmptyState icon="bell" title="All quiet" body="Nothing needs your attention right now." />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={460}>
    <EmptyState
      icon="cameras"
      title="No cameras"
      body="Add a Xiaomi camera to see live video and motion events."
      action={<Button label="Add camera" variant="tonal" />}
    />
  </Stage>
);
