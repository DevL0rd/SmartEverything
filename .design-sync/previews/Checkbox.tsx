import { type ReactElement, useState } from 'react';
import { Checkbox, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo(): ReactElement {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <Col>
      <Checkbox checked={a} onChange={setA} label="Notify me when someone arrives" />
      <Checkbox checked={b} onChange={setB} label="Include camera snapshots" />
      <Checkbox checked disabled onChange={() => undefined} label="Required by the hub" />
    </Col>
  );
}
export const States = (): ReactElement => (
  <Stage theme="dark" width={420}>
    <Demo />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={420}>
    <Demo />
  </Stage>
);
