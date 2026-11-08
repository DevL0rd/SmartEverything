import type { ReactElement } from 'react';
import { List, ListRow, Stage, ValueRow } from 'smarteverything-kit';

const body = (
  <>
    <List title="Living room lamp" footer="Changes apply immediately.">
      <ValueRow title="Model" value="Yeelight Color 1S" />
      <ValueRow title="Firmware" value="2.4.1" />
      <ValueRow title="IP address" value="192.168.1.34" />
    </List>
    <List inset title="Shortcuts">
      <ListRow title="Evening lights" subtitle="Runs at sunset" icon="lamp" chevron />
      <ListRow title="Goodnight" subtitle="Locks doors, turns off lights" icon="moon" chevron />
    </List>
  </>
);
export const Grouped = (): ReactElement => (
  <Stage theme="dark" width={480}>
    {body}
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={480}>
    {body}
  </Stage>
);
