import { useState } from 'react';
import { SelectRow, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const opts = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
function Demo() {
  const [t, setT] = useState('system');
  return (
    <Col gap={4}>
      <SelectRow title="Theme" icon="sun" options={opts} value={t} onChange={setT} />
      <SelectRow
        title="Default room"
        icon="home"
        options={[
          { value: 'a', label: 'Living room' },
          { value: 'b', label: 'Kitchen' },
        ]}
        value={null}
        onChange={() => undefined}
        placeholder="Not set"
      />
    </Col>
  );
}
export const Rows = () => (
  <Stage theme="dark" width={480}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <Demo />
  </Stage>
);
