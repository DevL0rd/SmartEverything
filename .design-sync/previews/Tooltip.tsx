import { Button, Stage, Tooltip } from 'smarteverything-kit';

const nativeClassOrder = <style>{'.text-bg{color:var(--color-bg) !important}'}</style>;
const body = (
  <div style={{ position: 'relative', height: 90, width: 200 }}>
    {nativeClassOrder}
    <Button label="Rename" variant="outlined" />
    <Tooltip text="Rename this device" placement="below" />
  </div>
);
export const Below = () => (
  <Stage theme="dark" width={320}>
    {body}
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={320}>
    {body}
  </Stage>
);
