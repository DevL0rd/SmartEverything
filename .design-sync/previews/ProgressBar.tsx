import type { ReactElement } from 'react';
import { ProgressBar, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const body = (
  <Col gap={20}>
    <ProgressBar progress={0.35} colour="viz-1" label="Firmware download 35%" />
    <ProgressBar progress={0.8} colour="positive" label="Backup 80%" thick />
    <ProgressBar progress={1} colour="primary" label="Sync complete" />
  </Col>
);
export const Bars = (): ReactElement => (
  <Stage theme="dark" width={420}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={420}>
    {body}
  </Stage>
);
