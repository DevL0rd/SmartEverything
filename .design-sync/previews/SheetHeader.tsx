import { SheetHeader, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={16}>
    <SheetHeader title="Power-on behaviour" onClose={() => undefined} touch={false} />
    <SheetHeader title="Move to room" onClose={() => undefined} touch />
  </Col>
);
export const Headers = () => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
