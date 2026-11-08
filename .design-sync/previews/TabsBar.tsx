import type { ReactElement } from 'react';
import { Stage, TabsBar } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const items = [
  { key: 'overview', label: 'Overview', onPress: (): void => undefined },
  { key: 'history', label: 'History', onPress: (): void => undefined },
  { key: 'automations', label: 'Automations', onPress: (): void => undefined },
  { key: 'settings', label: 'Settings', onPress: (): void => undefined },
];
const many = [
  ...items,
  { key: 'a', label: 'Energy', onPress: (): void => undefined },
  { key: 'b', label: 'Firmware', onPress: (): void => undefined },
];
export const Default = (): ReactElement => (
  <Stage theme="dark" width={520}>
    <TabsBar items={items} active="history" label="Device sections" />
  </Stage>
);
export const Dense = (): ReactElement => (
  <Stage theme="dark" width={520}>
    <TabsBar items={many} active="overview" label="Device sections" />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={520}>
    <Col>
      <TabsBar items={items} active="overview" label="Device sections" />
    </Col>
  </Stage>
);
