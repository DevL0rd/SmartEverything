import { Stage, TabsBar } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const items = [
  { key: 'overview', label: 'Overview', onPress: () => undefined },
  { key: 'history', label: 'History', onPress: () => undefined },
  { key: 'automations', label: 'Automations', onPress: () => undefined },
  { key: 'settings', label: 'Settings', onPress: () => undefined },
];
const many = [
  ...items,
  { key: 'a', label: 'Energy', onPress: () => undefined },
  { key: 'b', label: 'Firmware', onPress: () => undefined },
];
export const Default = () => (
  <Stage theme="dark" width={520}>
    <TabsBar items={items} active="history" label="Device sections" />
  </Stage>
);
export const Dense = () => (
  <Stage theme="dark" width={520}>
    <TabsBar items={many} active="overview" label="Device sections" />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    <Col>
      <TabsBar items={items} active="overview" label="Device sections" />
    </Col>
  </Stage>
);
