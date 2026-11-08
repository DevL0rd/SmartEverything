import type { ReactNode } from 'react';
import type { BoardWidget } from '@smarteverything/domain';
import { z } from 'zod';
import { GlobalTheme, Segmented, Stage, WidgetOptions } from 'smarteverything-kit';
import type { WidgetDefinition } from '../../apps/app/src/components/widget-board/types';
import { climateWidget } from '../board-demo';

const CLIMATE_OPTIONS = z.object({ unit: z.enum(['C', 'F']).default('C') });
type Unit = z.infer<typeof CLIMATE_OPTIONS>['unit'];

const climate: WidgetDefinition = {
  ...climateWidget,
  instanceOptions: {
    schema: CLIMATE_OPTIONS,
    editor: ({ value, onChange }) => (
      <Segmented<Unit>
        label="Unit"
        value={CLIMATE_OPTIONS.parse(value).unit}
        onChange={(unit) => {
          onChange({ unit });
        }}
        options={[
          { value: 'C', label: 'Celsius' },
          { value: 'F', label: 'Fahrenheit' },
        ]}
      />
    ),
  },
};
const widget: BoardWidget = { key: 'climate', type: 'climate', size: 'M', options: { unit: 'C' } };
const sheet = (
  <WidgetOptions
    widget={widget}
    definition={climate}
    onClose={() => undefined}
    onChange={() => undefined}
  />
);
export const Dark = (): ReactNode => <Stage theme="dark">{sheet}</Stage>;
export const Light = (): ReactNode => (
  <GlobalTheme theme="light">
    <Stage theme="light">{sheet}</Stage>
  </GlobalTheme>
);
