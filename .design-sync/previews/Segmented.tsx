import { useState } from 'react';
import { Segmented, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

function Demo() {
  const [range, setRange] = useState('week');
  const [mode, setMode] = useState('heat');
  return (
    <Col>
      <Segmented
        label="Range"
        value={range}
        onChange={setRange}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />
      <Segmented
        label="Mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'heat', label: 'Heat', icon: 'heater' },
          { value: 'cool', label: 'Cool', icon: 'fan' },
          { value: 'auto', label: 'Auto', icon: 'sparkles' },
        ]}
      />
      <Segmented
        label="Locked"
        disabled
        value="day"
        onChange={() => undefined}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'night', label: 'Night' },
        ]}
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
