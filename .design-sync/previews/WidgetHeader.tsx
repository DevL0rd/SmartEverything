import type { ReactElement } from 'react';
import { Button, Stage, WidgetHeader } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={16}>
    <WidgetHeader title="Climate" icon="thermometer" accent="temp-warm" />
    <WidgetHeader title="Cameras" icon="cameras" accent="viz-3" href="/cameras" />
    <WidgetHeader
      title="Scenes"
      icon="sparkles"
      accent="primary"
      action={<Button label="Edit" variant="text" />}
    />
  </Col>
);
export const Headers = (): ReactElement => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
