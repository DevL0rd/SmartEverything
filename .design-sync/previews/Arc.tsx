import type { ReactNode } from 'react';
import { Arc, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const body = (
  <Row gap={28}>
    <Arc value={0.72} size={110} thickness={10} colour="viz-1" />
    <Arc value={0.4} size={110} thickness={10} colour="move" trackColour="outline-variant" />
    <Arc
      value={0.9}
      size={110}
      thickness={14}
      colour="positive"
      startAngle={-135}
      sweep={270}
      tinted
    />
  </Row>
);
export const Progress = (): ReactNode => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
