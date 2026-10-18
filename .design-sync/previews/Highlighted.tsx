import { Highlighted, Stage, Text } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={8}>
    <Text>
      <Highlighted text="Living room floor lamp" range={{ start: 7, end: 11 }} />
    </Text>
    <Text variant="callout" tone="variant">
      <Highlighted text="Turn off the hallway lights at midnight" range={{ start: 13, end: 20 }} />
    </Text>
  </Col>
);
export const Matches = () => (
  <Stage theme="dark" width={460}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    {body}
  </Stage>
);
