import { HomeIdentity, Stage } from 'smarteverything-kit';

const fp = '3fa91c07d25b8e46a0c7f1359de2b684c0173aa9f5e8d1b2764c9a03e58df1ab';
export const Fingerprint = () => (
  <Stage theme="dark" width={420}>
    <HomeIdentity value={fp} helper="Confirm this matches the code shown on your hub." />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <HomeIdentity value={fp} helper="Confirm this matches the code shown on your hub." />
  </Stage>
);
