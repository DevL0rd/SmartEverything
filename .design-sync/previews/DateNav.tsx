import { useState } from 'react';
import { DateNav, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const base = new Date(2026, 9, 14, 12, 0);
function Demo() {
  const [d, setD] = useState(base);
  const [w, setW] = useState(base);
  const [m, setM] = useState(base);
  return (
    <Col gap={16}>
      <DateNav value={d} range="day" onChange={setD} max={new Date(2026, 9, 16)} />
      <DateNav value={w} range="week" onChange={setW} max={new Date(2026, 9, 16)} />
      <DateNav value={m} range="month" onChange={setM} max={new Date(2026, 9, 16)} />
    </Col>
  );
}
export const Ranges = () => (
  <Stage theme="dark" width={420}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <Demo />
  </Stage>
);
