import { Stage, Text, WidgetSurface } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tile = (glow: 'primary' | 'positive' | null) => (
  <div style={{ width: 200, height: 120 }}>
    <WidgetSurface glow={glow}>
      <div style={{ padding: 16 }}>
        <Text variant="title-3">{glow === null ? 'Plain surface' : 'With glow'}</Text>
      </div>
    </WidgetSurface>
  </div>
);
export const Surfaces = () => (
  <Stage theme="dark" width={500}>
    <Row gap={16}>
      {tile(null)}
      {tile('primary')}
    </Row>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={500}>
    <Row gap={16}>
      {tile(null)}
      {tile('positive')}
    </Row>
  </Stage>
);
