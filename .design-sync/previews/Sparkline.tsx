import { Sparkline, Stage, Text } from 'smarteverything-kit';
import { Col, Row } from '../preview-helpers';

const t0 = new Date(2026, 9, 14).getTime();
const mk = (f: (i: number) => number) =>
  Array.from({ length: 30 }, (_, i) => ({ t: t0 + i * 600_000, v: f(i) }));
const heart = mk((i) => 64 + 8 * Math.sin(i / 3) + (i % 4));
const power = mk((i) => 180 + 120 * Math.abs(Math.sin(i / 5)));
const body = (
  <Col gap={16}>
    <Row gap={16}>
      <Text variant="callout" tone="variant">
        Heart rate
      </Text>
      <div style={{ width: 220 }}>
        <Sparkline points={heart} colour="heart" height={40} />
      </div>
    </Row>
    <Row gap={16}>
      <Text variant="callout" tone="variant">
        Power draw
      </Text>
      <div style={{ width: 220 }}>
        <Sparkline points={power} colour="viz-1" height={40} area />
      </div>
    </Row>
    <Row gap={16}>
      <Text variant="callout" tone="variant">
        Humidity
      </Text>
      <div style={{ width: 220 }}>
        <Sparkline points={mk((i) => 48 + (i % 7))} colour="humidity" height={40} area />
      </div>
    </Row>
  </Col>
);
export const Variants = () => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
