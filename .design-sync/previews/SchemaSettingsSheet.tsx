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
const sheet = (
  <SchemaSettingsSheet schema={schema} value={value as never} change={() => undefined} />
);
export const Dark = () => <Stage theme="dark">{sheet}</Stage>;
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">{sheet}</Stage>
  </GlobalTheme>
);
