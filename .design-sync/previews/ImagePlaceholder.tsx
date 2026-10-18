import { ImagePlaceholder, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const box = (a: boolean) => (
  <div
    style={{ width: 200, height: 120, position: 'relative', borderRadius: 12, overflow: 'hidden' }}
  >
    <ImagePlaceholder active={a} />
  </div>
);
export const States = () => (
  <Stage theme="dark" width={520}>
    <Row gap={16}>
      {box(false)}
      {box(true)}
    </Row>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    <Row gap={16}>
      {box(false)}
      {box(true)}
    </Row>
  </Stage>
);
