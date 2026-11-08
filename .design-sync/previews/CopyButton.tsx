import type { ReactElement } from 'react';
import { CopyButton, Stage, Text } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row>
    <Text variant="callout">dana@example.com</Text>
    <CopyButton value="dana@example.com" label="Copy email" />
  </Row>
);
export const Inline = (): ReactElement => (
  <Stage theme="dark" width={360}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={360}>
    {body}
  </Stage>
);
