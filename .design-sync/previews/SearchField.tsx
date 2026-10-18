import { useState } from 'react';
import { SearchField, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo() {
  const [q, setQ] = useState('');
  const [r, setR] = useState('lamp');
  return (
    <Col>
      <SearchField
        value={q}
        onChange={setQ}
        placeholder="Search devices, rooms and scenes"
        shortcut="/"
      />
      <SearchField variant="field" value={r} onChange={setR} placeholder="Filter" />
    </Col>
  );
}
export const Variants = () => (
  <Stage theme="dark" width={460}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    <Demo />
  </Stage>
);
