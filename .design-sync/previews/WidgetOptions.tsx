import { z } from 'zod';
import { GlobalTheme, Segmented, Stage, WidgetOptions } from 'smarteverything-kit';
import { catalogue } from '../board-demo';

const climate = {
  ...catalogue[0]!,
  instanceOptions: {
    schema: z.object({ unit: z.enum(['C', 'F']).default('C') }),
    editor: ({
      value,
      onChange,
    }: {
      value: { unit: 'C' | 'F' };
      onChange: (v: { unit: 'C' | 'F' }) => void;
    }) => (
      <Segmented
        label="Unit"
        value={value.unit}
        onChange={(unit) => onChange({ unit: unit as 'C' | 'F' })}
        options={[
          { value: 'C', label: 'Celsius' },
          { value: 'F', label: 'Fahrenheit' },
        ]}
      />
    ),
  },
};
const widget = { key: 'climate', type: 'climate', size: 'M', options: { unit: 'C' } };
const sheet = (
  <WidgetOptions
    widget={widget}
    definition={climate as never}
    onClose={() => undefined}
    onChange={() => undefined}
  />
);
export const Dark = () => <Stage theme="dark">{sheet}</Stage>;
export const Light = () => (
  <GlobalTheme theme="light">
    <Stage theme="light">{sheet}</Stage>
  </GlobalTheme>
);
