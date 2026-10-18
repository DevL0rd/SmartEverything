import { CodeScanner, Stage } from 'smarteverything-kit';

const scanner = (shape: 'square' | 'wide') => (
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
export const Square = () => (
  <Stage theme="dark" width={420}>
    {scanner('square')}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    {scanner('square')}
  </Stage>
);
