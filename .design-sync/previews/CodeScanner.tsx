import type { ReactElement } from 'react';
import { CodeScanner, Stage } from 'smarteverything-kit';

const scanner = (shape: 'square' | 'wide'): ReactElement => (
  <div style={{ height: 380, display: 'flex', flexDirection: 'column' }}>
    <CodeScanner
      types={['qr']}
      hint="Point the camera at the QR code on your hub"
      purpose="pairing"
      shape={shape}
      read={(d) => d}
      onClose={() => undefined}
    />
  </div>
);
export const Square = (): ReactElement => (
  <Stage theme="dark" width={420}>
    {scanner('square')}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={420}>
    {scanner('square')}
  </Stage>
);
