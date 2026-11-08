import type { ReactElement } from 'react';
import { OverflowButton, Stage, Text } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const items = [
  { label: 'Rename', icon: 'customize' as const, onPress: (): void => undefined },
  { label: 'Remove', icon: 'close' as const, destructive: true, onPress: (): void => undefined },
];
const body = (
  <Row>
    <Text>Evening lights</Text>
    <OverflowButton items={items} label="More actions" />
  </Row>
);
export const Closed = (): ReactElement => (
  <Stage theme="dark" width={320}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={320}>
    {body}
  </Stage>
);
