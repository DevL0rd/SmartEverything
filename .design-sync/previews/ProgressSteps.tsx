import { ProgressSteps, Stage } from 'smarteverything-kit';

const steps = [
  { label: 'Find the hub', state: 'done' as const },
  { label: 'Sign in to Xiaomi', state: 'done' as const, detail: 'dana@example.com' },
  { label: 'Import devices', state: 'active' as const, detail: '14 of 23 imported' },
  { label: 'Assign rooms', state: 'waiting' as const },
  { label: 'Enable cameras', state: 'failed' as const, detail: 'Cloud region not supported' },
];
export const Setup = () => (
  <Stage theme="dark" width={420}>
    <ProgressSteps steps={steps} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <ProgressSteps steps={steps} />
  </Stage>
);
