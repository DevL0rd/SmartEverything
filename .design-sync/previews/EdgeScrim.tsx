import { EdgeScrim, Stage } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tile = (edge: 'top' | 'bottom') => (
  <div
    style={{
      position: 'relative',
      width: 200,
      height: 120,
      borderRadius: 12,
      overflow: 'hidden',
      background: 'linear-gradient(135deg,#d98b4a,#4a6fd9)',
    }}
  >
    <EdgeScrim edge={edge} />
  </div>
);
export const Edges = () => (
  <Stage theme="dark" width={480}>
    <Row gap={16}>
      {tile('top')}
      {tile('bottom')}
    </Row>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <Row gap={16}>
      {tile('top')}
      {tile('bottom')}
    </Row>
  </Stage>
);
