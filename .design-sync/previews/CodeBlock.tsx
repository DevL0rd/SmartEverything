import { CodeBlock, Stage } from 'smarteverything-kit';

const code = `trigger: sunset
offset: -15m
actions:
  - device: living-room-lamp
    set: { on: true, brightness: 40 }
  - scene: evening`;
export const Yaml = () => (
  <Stage theme="dark" width={460}>
    <CodeBlock code={code} label="Automation definition" />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    <CodeBlock code={code} label="Automation definition" />
  </Stage>
);
