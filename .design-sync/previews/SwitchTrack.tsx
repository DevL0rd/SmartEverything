import type { ReactElement } from 'react';
import { Stage, SwitchTrack } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row gap={20}>
    <SwitchTrack value />
    <SwitchTrack value={false} />
    <SwitchTrack value mixed />
  </Row>
);
export const Tracks = (): ReactElement => (
  <Stage theme="dark" width={320}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={320}>
    {body}
  </Stage>
);
