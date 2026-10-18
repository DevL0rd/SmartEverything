import { DecisionApproval, Stage } from 'smarteverything-kit';

const options = [
  { id: 'once', label: 'Allow once', effect: 'allow' as const },
  {
    id: 'session',
    label: 'Allow for this session',
    description: 'Applies to this chat only.',
    effect: 'allow' as const,
  },
  { id: 'deny', label: 'Deny', effect: 'deny' as const },
];
export const Choices = () => (
  <Stage theme="dark" width={480}>
    <DecisionApproval options={options} pending={false} answer={() => undefined} />
  </Stage>
);
export const Pending = () => (
  <Stage theme="dark" width={480}>
    <DecisionApproval options={options} pending answer={() => undefined} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <DecisionApproval options={options} pending={false} answer={() => undefined} />
  </Stage>
);
