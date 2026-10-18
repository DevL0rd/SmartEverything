import { Stage, WidgetStats } from 'smarteverything-kit';

const stats = [
  {
    key: 'a',
    icon: 'thermometer' as const,
    colour: 'temp-warm' as const,
    label: 'Temperature',
    value: '21.5',
    unit: 'C',
  },
  {
    key: 'b',
    icon: 'droplet' as const,
    colour: 'humidity' as const,
    label: 'Humidity',
    value: '48',
    unit: '%',
  },
  {
    key: 'c',
    icon: 'cloud' as const,
    colour: 'air-good' as const,
    label: 'Air quality',
    value: '34',
    caption: 'Good',
  },
  {
    key: 'd',
    icon: 'power' as const,
    colour: 'viz-1' as const,
    label: 'Power',
    value: '212',
    unit: 'W',
  },
];
export const TwoColumns = () => (
  <Stage theme="dark" width={520}>
    <WidgetStats stats={stats} columns={2} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={520}>
    <WidgetStats stats={stats} columns={2} />
  </Stage>
);
