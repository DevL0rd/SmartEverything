import type { ReactElement } from 'react';
import { SheetHeader, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={16}>
    <SheetHeader title="Power-on behaviour" onClose={() => undefined} touch={false} />
    <SheetHeader title="Move to room" onClose={() => undefined} touch />
  </Col>
);
export const Headers = (): ReactElement => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
