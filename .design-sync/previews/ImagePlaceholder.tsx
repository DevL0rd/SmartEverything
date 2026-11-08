import type { ReactElement } from 'react';
import { ImagePlaceholder, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const box = (a: boolean): ReactElement => (
  <div
    style={{ width: 200, height: 120, position: 'relative', borderRadius: 12, overflow: 'hidden' }}
  >
    <ImagePlaceholder active={a} />
  </div>
);
export const States = (): ReactElement => (
  <Stage theme="dark" width={520}>
    <Row gap={16}>
      {box(false)}
      {box(true)}
    </Row>
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={520}>
    <Row gap={16}>
      {box(false)}
      {box(true)}
    </Row>
  </Stage>
);
