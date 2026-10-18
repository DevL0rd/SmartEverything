import { useState } from 'react';
import { Stage, SwitchRow } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <Col gap={4}>
      <SwitchRow
        title="Motion alerts"
        subtitle="Notify me when a camera sees movement"
        icon="motion"
        value={a}
        onChange={setA}
      />
      <SwitchRow
        title="Night mode"
        subtitle="Dim lights after sunset"
        icon="moon"
        value={b}
        onChange={setB}
      />
      <SwitchRow
        title="All room lights"
        subtitle="Some are on"
        icon="lamp"
        value
        mixed
        onChange={() => undefined}
      />
      <SwitchRow title="Locked setting" icon="lock" value disabled onChange={() => undefined} />
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
