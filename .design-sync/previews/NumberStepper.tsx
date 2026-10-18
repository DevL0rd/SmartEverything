import { useState } from 'react';
import { NumberStepper, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo() {
  const [a, setA] = useState(21);
  const [b, setB] = useState(30);
  return (
    <Col>
      <NumberStepper
        label="Target temperature"
        value={a}
        min={16}
        max={28}
        step={0.5}
        unit="C"
        onChange={setA}
      />
      <NumberStepper
        label="Timer minutes"
        value={b}
        min={5}
        max={120}
        step={5}
        unit="min"
        onChange={setB}
      />
      <NumberStepper
        label="Humidity setpoint"
        value={0}
        min={0}
        max={100}
        step={1}
        unit="%"
        unknownValue="Not set"
        onChange={() => undefined}
        disabled
      />
    </Col>
  );
}
export const Variants = () => (
  <Stage theme="dark" width={420}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <Demo />
  </Stage>
);
