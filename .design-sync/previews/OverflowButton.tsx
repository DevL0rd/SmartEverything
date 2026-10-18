import { OverflowButton, Stage, Text } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const items = [
  { label: 'Rename', icon: 'customize' as const, onPress: () => undefined },
  { label: 'Remove', icon: 'close' as const, destructive: true, onPress: () => undefined },
];
const body = (
  <Row>
    <Text>Evening lights</Text>
    <OverflowButton items={items} label="More actions" />
  </Row>
);
export const Closed = () => (
  <Stage theme="dark" width={320}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={320}>
    {body}
  </Stage>
);
