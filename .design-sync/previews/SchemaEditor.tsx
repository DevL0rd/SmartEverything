import { useState } from 'react';
import { SchemaEditor, Stage } from 'smarteverything-kit';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    enabled: { type: 'boolean' },
    brightness: { type: 'integer' },
    mode: { enum: ['comfort', 'eco', 'away'] },
  },
};
function Demo() {
  const [v, setV] = useState<Record<string, unknown>>({
    name: 'Evening lights',
    enabled: true,
    brightness: 40,
    mode: 'eco',
  });
  return <SchemaEditor schema={schema} value={v as never} change={setV as never} />;
}
export const Editor = () => (
  <Stage theme="dark" width={480}>
    <Demo />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <Demo />
  </Stage>
);
