import { Gauge, Stage, Text } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const aqi = [
  { upTo: 50, colour: 'air-good' as const },
  { upTo: 100, colour: 'air-moderate' as const },
  { upTo: 200, colour: 'air-poor' as const },
  { upTo: 300, colour: 'air-bad' as const },
];
const body = (
  <Row gap={32}>
    <Gauge value={34} min={0} max={300} bands={aqi} size={150} label="Air quality index 34, good">
      <Text variant="title-1">34</Text>
    </Gauge>
    <Gauge value={142} min={0} max={300} bands={aqi} size={150} label="Air quality index 142, poor">
      <Text variant="title-1">142</Text>
    </Gauge>
  </Row>
);
export const AirQuality = () => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
