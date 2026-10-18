import { Button, Stage } from 'smarteverything-kit';

export const Variants = () => (
  <Stage theme="dark" width={420}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Button label="Pair device" icon="plus" />
      <Button label="Run scene" variant="tonal" icon="sparkles" />
      <Button label="View history" variant="outlined" />
      <Button label="Skip for now" variant="text" />
      <Button label="Remove device" variant="destructive" icon="close" />
    </div>
  </Stage>
);

export const States = () => (
  <Stage theme="dark" width={420}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Button label="Saving changes" loading />
      <Button label="Unavailable offline" disabled variant="tonal" />
      <Button label="Large primary action" size="lg" />
    </div>
  </Stage>
);

export const LightTheme = () => (
  <Stage theme="light" width={420}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Button label="Pair device" icon="plus" />
      <Button label="Run scene" variant="tonal" icon="sparkles" />
      <Button label="View history" variant="outlined" />
      <Button label="Remove device" variant="destructive" />
    </div>
  </Stage>
);
