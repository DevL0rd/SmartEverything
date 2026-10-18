import { Figure, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row gap={32}>
    <Figure value="21.5" unit="C" size="s" />
    <Figure value="48" unit="%" size="m" tone="info" />
    <Figure value="1,284" unit="kWh" size="l" tone="primary" />
    <Figure value="72" unit="bpm" size="xl" tone="positive" />
    <Figure value="--" size="m" stale />
  </Row>
);
export const Sizes = () => (
  <Stage theme="dark" width={640}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={640}>
    {body}
  </Stage>
);
