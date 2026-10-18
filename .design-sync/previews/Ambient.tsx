import { Ambient, Stage, Text } from 'smarteverything-kit';

const body = (
  <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
    <Ambient />
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Text variant="title-2">Home</Text>
      <Text tone="variant">The ambient wash tints the top of a page with the accent colour.</Text>
    </div>
  </div>
);
export const Wash = () => (
  <Stage theme="dark" width={560}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={560}>
    {body}
  </Stage>
);
