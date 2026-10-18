import { SizeLabel, Stage, WidgetSurface } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tile = (label: string) => (
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
export const Labels = () => (
  <Stage theme="dark" width={520}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    {body}
  </Stage>
);
