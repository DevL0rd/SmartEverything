import { useState, type ReactNode } from 'react';
import { ColourPicker, Stage } from 'smarteverything-kit';

function Demo(): ReactNode {
  const [v, setV] = useState({ hue: 32, saturation: 60, value: 100 });
  return <ColourPicker label="Lamp colour" value={v} onChange={setV} onCommit={setV} />;
}
export const Default = (): ReactNode => (
  <Stage theme="dark" width={360}>
    <Demo />
  </Stage>
);
export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={360}>
    <Demo />
  </Stage>
);
