import type { ReactElement } from 'react';
import { ActionDetails, Stage } from 'smarteverything-kit';

const value = {
  device: 'Living room lamp',
  command: 'set_brightness',
  arguments: { level: 40, transition_ms: 800 },
  api_key: 'abc',
  rooms: ['Living room', 'Hallway'],
};
export const Details = (): ReactElement => (
  <Stage theme="dark" width={460}>
    <ActionDetails title="Requested action" value={value} />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={460}>
    <ActionDetails title="Requested action" value={value} />
  </Stage>
);
