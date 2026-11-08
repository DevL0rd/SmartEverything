import type { ReactElement } from 'react';
import { Glow, Stage, Text } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

const tile = (
  colour: 'primary' | 'positive' | 'info',
  label: string,
  strength?: number,
): ReactElement => (
  <div
    style={{
      position: 'relative',
      width: 180,
      height: 120,
      borderRadius: 16,
      overflow: 'hidden',
      background: 'var(--color-surface-1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Glow colour={colour} strength={strength ?? 0.3} />
    <Text variant="callout">{label}</Text>
  </div>
);
const body = (
  <Row gap={16}>
    {tile('primary', 'Heating')}
    {tile('positive', 'All clear')}
    {tile('info', 'Cooling', 0.5)}
  </Row>
);
export const Colours = (): ReactElement => (
  <Stage theme="dark" width={640}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={640}>
    {body}
  </Stage>
);
