import { Button, FlowFrame, Stage, TextField } from 'smarteverything-kit';

const steps = [
  { label: 'Find hub', state: 'done' as const },
  { label: 'Sign in', state: 'active' as const },
  { label: 'Import devices', state: 'waiting' as const },
];
const frame = (
  <FlowFrame
    title="Connect Xiaomi"
    steps={steps}
    onCancel={() => undefined}
    footer={
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button label="Back" variant="text" />
        <Button label="Continue" />
      </div>
    }
  >
    <TextField
      label="Account email"
      value="dana@example.com"
      onChange={() => undefined}
      helper="Use the account from the Mi Home app"
    />
    <TextField label="Region" value="Europe" onChange={() => undefined} />
  </FlowFrame>
);
export const SignIn = () => (
  <Stage theme="dark" width={820} height={520}>
    {frame}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={820} height={520}>
    {frame}
  </Stage>
);
