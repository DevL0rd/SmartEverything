import type { ReactElement } from 'react';
import { GlobalTheme, SchemaSettingsSheet, Stage } from 'smarteverything-kit';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    enabled: { type: 'boolean' },
    mode: { enum: ['comfort', 'eco', 'away'] },
  },
};
const value = { name: 'Evening lights', enabled: true, mode: 'eco' };
const sheet = <SchemaSettingsSheet schema={schema} value={value} change={() => undefined} />;
export const Dark = (): ReactElement => <Stage theme="dark">{sheet}</Stage>;
export const Light = (): ReactElement => (
  <GlobalTheme theme="light">
    <Stage theme="light">{sheet}</Stage>
  </GlobalTheme>
);
