import { EditToolbar, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={20}>
    <EditToolbar
      touch={false}
      canUndo
      onUndo={() => undefined}
      onReset={() => undefined}
      onAdd={() => undefined}
    />
    <EditToolbar
      touch
      canUndo={false}
      onUndo={() => undefined}
      onReset={() => undefined}
      onAdd={() => undefined}
    />
  </Col>
);
export const Toolbars = () => (
  <Stage theme="dark" width={620}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={620}>
    {body}
  </Stage>
);
