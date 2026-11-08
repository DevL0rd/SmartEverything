import type { ReactElement } from 'react';
import { SizeLabel, Stage, WidgetSurface } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tile = (label: string): ReactElement => (
  <div style={{ position: 'relative', width: 150, height: 110 }}>
    <WidgetSurface>
      <SizeLabel label={label} />
    </WidgetSurface>
  </div>
);
const body = (
  <Row gap={16}>
    {tile('Small')}
    {tile('Medium')}
    {tile('Wide')}
  </Row>
);
export const Labels = (): ReactElement => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
