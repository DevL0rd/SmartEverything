import { useState } from 'react';
import { Slider, Stage, Text } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo() {
  const [v, setV] = useState(65);
  const [t, setT] = useState(21);
  return (
    <Col gap={20}>
      <Slider
        label="Brightness"
        value={v}
        min={0}
        max={100}
        step={1}
        onChange={setV}
        onCommit={setV}
        formatValue={(x) => `${x}%`}
      />
      <Slider
        label="Target temperature"
        value={t}
        min={16}
        max={28}
        step={0.5}
        onChange={setT}
        onCommit={setT}
        formatValue={(x) => `${x.toFixed(1)} C`}
      />
      <Slider
        label="Volume"
        value={null}
        min={0}
        max={100}
        step={1}
        onCommit={() => undefined}
        unknownValue="Unknown"
      />
      <Slider
        label="Dimmer (disabled)"
        value={30}
        min={0}
        max={100}
        step={1}
        disabled
        onCommit={() => undefined}
        formatValue={(x) => `${x}%`}
      />
    </Col>
  );
}
export const Horizontal = () => (
  <Stage theme="dark" width={420}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <Demo />
  </Stage>
);
export const Vertical = () => (
  <Stage theme="dark" width={200}>
    <div style={{ height: 220, display: 'flex' }}>
      <Slider
        label="Fan speed"
        orientation="vertical"
        value={60}
        min={0}
        max={100}
        step={10}
        onCommit={() => undefined}
        formatValue={(x) => `${x}%`}
      />
    </div>
    <Text variant="caption" tone="variant">
      Fan speed
    </Text>
  </Stage>
);
