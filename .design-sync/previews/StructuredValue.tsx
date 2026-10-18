import { Stage, StructuredValue } from 'smarteverything-kit';

const value = {
  name: 'Evening lights',
  enabled: true,
  schedule: { time: '18:30' },
  brightness: 40,
  lastRun: null,
};
export const Object = () => (
  <Stage theme="dark" width={460}>
    <StructuredValue title="Automation" value={value} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    <StructuredValue title="Automation" value={value} />
  </Stage>
);
