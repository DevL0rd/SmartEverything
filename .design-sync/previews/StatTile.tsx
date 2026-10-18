import { StatTile, Stage, Text } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tiles = (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
    <StatTile
      label="Temperature"
      value="21.5"
      unit="C"
      caption="Living room"
      tone="primary"
      trend={
        <Text variant="caption" tone="positive">
          +0.4 since noon
        </Text>
      }
    />
    <StatTile label="Humidity" value="48" unit="%" caption="Within comfort range" tone="info" />
    <StatTile
      label="Energy today"
      value="6.2"
      unit="kWh"
      caption="12% below average"
      tone="positive"
    />
    <StatTile label="Air quality" value="--" caption="Sensor offline" stale />
  </div>
);
export const Grid = () => (
  <Stage theme="dark" width={520}>
    {tiles}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {tiles}
  </Stage>
);
export const Pressable = () => (
  <Stage theme="dark" width={260}>
    <Row>
      <StatTile label="Steps" value="8,412" caption="Goal 10,000" onPress={() => undefined} />
    </Row>
  </Stage>
);
