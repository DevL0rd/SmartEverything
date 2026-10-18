import { useState } from 'react';
import { ColourSwatches, Stage } from 'smarteverything-kit';

const options = [
  { value: 'amber', label: 'Amber', swatchClassName: 'bg-viz-2' },
  { value: 'teal', label: 'Teal', swatchClassName: 'bg-viz-1' },
  { value: 'violet', label: 'Violet', swatchClassName: 'bg-viz-3' },
  { value: 'coral', label: 'Coral', swatchClassName: 'bg-viz-4' },
  { value: 'lime', label: 'Lime', swatchClassName: 'bg-viz-5' },
  { value: 'blue', label: 'Blue', swatchClassName: 'bg-viz-6' },
];
function Demo({ off }: { off?: boolean }) {
  const [v, setV] = useState('teal');
  return (
    <ColourSwatches
      label="Accent colour"
      options={options}
      value={v}
      onChange={setV}
      disabled={off}
    />
  );
}
export const Selectable = () => (
  <Stage theme="dark" width={420}>
    <Demo />
  </Stage>
);
export const Disabled = () => (
  <Stage theme="dark" width={420}>
    <Demo off />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <Demo />
  </Stage>
);
