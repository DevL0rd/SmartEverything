import { useState } from 'react';
import { Stage, TargetDial } from 'smarteverything-kit';
import { Row } from '../preview-helpers';

function Demo() {
  const [t, setT] = useState(22);
  return (
    <Row gap={32}>
      <TargetDial
        current={20.5}
        target={t}
        min={16}
        max={28}
        step={0.5}
        unit="C"
        label="Heating target"
        onCommit={setT}
        size={200}
        colour="temp-warm"
      />
      <TargetDial
        current={null}
        target={24}
        min={16}
        max={30}
        step={1}
        unit="C"
        label="Cooling target"
        onCommit={() => undefined}
        size={160}
        colour="temp-cool"
      />
    </Row>
  );
}
export const Thermostat = () => (
  <Stage theme="dark" width={520}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    <Demo />
  </Stage>
);
