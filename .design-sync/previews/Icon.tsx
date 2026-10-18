import { Icon, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const names = [
  'home',
  'climate',
  'cameras',
  'fitness',
  'automations',
  'lamp',
  'lock',
  'thermometer',
  'blinds',
  'speaker',
  'bell',
  'vacuum',
] as const;
export const Gallery = () => (
  <Stage theme="dark" width={520}>
    <Row gap={20}>
      {names.map((n) => (
        <Icon key={n} name={n} size={24} tone="default" />
      ))}
    </Row>
  </Stage>
);
export const SizesAndTones = () => (
  <Stage theme="dark" width={520}>
    <Row gap={20}>
      {([16, 20, 24, 32, 40] as const).map((s) => (
        <Icon key={s} name="bulb" size={s} tone="primary" />
      ))}
      <Icon name="shield" size={24} tone="positive" />
      <Icon name="bell" size={24} tone="warning" />
      <Icon name="smoke" size={24} tone="critical" />
      <Icon name="cloud" size={24} tone="info" />
    </Row>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    <Row gap={20}>
      {names.map((n) => (
        <Icon key={n} name={n} size={24} tone="default" />
      ))}
    </Row>
  </Stage>
);
