import { useState, type ReactElement, type ComponentProps } from 'react';
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
function Demo(): ReactElement {
  const [v, setV] = useState<ComponentProps<typeof SchemaEditor>['value']>({
    name: 'Evening lights',
    enabled: true,
    brightness: 40,
    mode: 'eco',
  });
  return <SchemaEditor schema={schema} value={v} change={setV} />;
}
export const Editor = (): ReactElement => (
  <Stage theme="dark" width={480}>
    <Demo />
  </Stage>
);
export const LightTheme = (): ReactElement => (
  <Stage theme="light" width={480}>
    <Demo />
  </Stage>
);
