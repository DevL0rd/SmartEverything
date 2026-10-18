import { useEffect } from 'react';
import {
  Figure,
  Text,
  WidgetBoard,
  WidgetFrame,
  WidgetStat,
  WidgetStats,
  useBoardEditor,
} from 'smarteverything-kit';

type Size = 'S' | 'M' | 'W' | 'L' | 'XL';

const ALL: Record<'compact' | 'medium' | 'expanded', readonly Size[]> = {
  compact: ['S', 'M', 'W', 'L', 'XL'],
  medium: ['S', 'M', 'W', 'L', 'XL'],
  expanded: ['S', 'M', 'W', 'L', 'XL'],
};

function ClimateBody({ size }: { size: Size }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Figure value="21.5" unit="C" size={size === 'S' ? 'm' : 'l'} tone="primary" />
      <Text variant="caption" tone="variant">
        Living room, 48% humidity
      </Text>
    </div>
  );
}

export const catalogue = [
  {
    type: 'climate',
    title: 'Climate',
    icon: 'thermometer' as const,
    group: 'Home',
    sizes: ALL,
    defaultSize: 'M' as const,
    render: ({ size }: { size: Size }) => (
      <WidgetFrame title="Climate" icon="thermometer" accent="temp-warm" size={size}>
        <ClimateBody size={size} />
      </WidgetFrame>
    ),
  },
  {
    type: 'energy',
    title: 'Energy',
    icon: 'power' as const,
    group: 'Home',
    sizes: ALL,
    defaultSize: 'M' as const,
    render: ({ size }: { size: Size }) => (
      <WidgetFrame title="Energy" icon="power" accent="viz-1" size={size}>
        <WidgetStats
          columns={1}
          stats={[
            {
              key: 'today',
              icon: 'activity',
              colour: 'viz-1',
              label: 'Today',
              value: '6.2',
              unit: 'kWh',
              caption: '12% below average',
            },
          ]}
        />
      </WidgetFrame>
    ),
  },
  {
    type: 'security',
    title: 'Security',
    icon: 'shield' as const,
    group: 'Safety',
    sizes: ALL,
    defaultSize: 'M' as const,
    render: ({ size }: { size: Size }) => (
      <WidgetFrame title="Security" icon="shield" accent="positive" size={size} glow="positive">
        <WidgetStat
          icon="lock"
          colour="positive"
          label="Front door"
          value="Locked"
          caption="8 minutes ago"
          tone="positive"
        />
      </WidgetFrame>
    ),
  },
  {
    type: 'health',
    title: 'Activity',
    icon: 'fitness' as const,
    group: 'Health',
    sizes: ALL,
    defaultSize: 'M' as const,
    render: ({ size }: { size: Size }) => (
      <WidgetFrame title="Activity" icon="fitness" accent="move" size={size}>
        <WidgetStat
          icon="activity"
          colour="move"
          label="Steps"
          value="8,412"
          caption="Goal 10,000"
        />
      </WidgetFrame>
    ),
  },
];

const defaults = {
  compact: [
    { key: 'climate', type: 'climate', size: 'M' as const },
    { key: 'security', type: 'security', size: 'S' as const },
    { key: 'energy', type: 'energy', size: 'S' as const },
  ],
  medium: [
    { key: 'climate', type: 'climate', size: 'M' as const },
    { key: 'security', type: 'security', size: 'S' as const },
    { key: 'energy', type: 'energy', size: 'S' as const },
    { key: 'health', type: 'health', size: 'M' as const },
  ],
  expanded: [
    { key: 'climate', type: 'climate', size: 'M' as const },
    { key: 'security', type: 'security', size: 'S' as const },
    { key: 'energy', type: 'energy', size: 'S' as const },
    { key: 'health', type: 'health', size: 'M' as const },
  ],
};

export const available = new Set(catalogue.map((entry) => entry.type));

export function BoardDemo({ editing }: { editing?: boolean }) {
  const editor = useBoardEditor({
    page: 'demo',
    layout: { status: 'ready', layout: null },
    defaults: defaults as never,
    onSave: () => undefined,
  });
  useEffect(() => {
    if (editing) editor.begin();
  }, []);
  return <WidgetBoard editor={editor} catalogue={catalogue as never} available={available} />;
}
