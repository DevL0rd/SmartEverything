import { useState } from 'react';
import { ColourPicker, Stage } from 'smarteverything-kit';

function Demo() {
  const [v] = useState({ hue: 32, saturation: 60, value: 100 });
  return <ColourPicker label="Lamp colour" value={v} />;
}
export const Default = () => (
  <Stage theme="dark" width={360}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={360}>
    <Demo />
  </Stage>
);
