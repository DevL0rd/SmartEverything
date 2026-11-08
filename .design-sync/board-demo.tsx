import { useEffect, type ReactNode } from 'react';
import { WIDGET_SIZES } from '../packages/domain/src';
import type {
  BoardDefaults,
  WidgetDefinition,
} from '../apps/app/src/components/widget-board/types';
import {
  Figure,
  Text,
  WidgetBoard,
  WidgetFrame,
  WidgetStat,
  WidgetStats,
  useBoardEditor,
} from 'smarteverything-kit';

const ALL: WidgetDefinition['sizes'] = {
  compact: WIDGET_SIZES,
  medium: WIDGET_SIZES,
  expanded: WIDGET_SIZES,
};

function ClimateBody(): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Figure value="21.5" unit="C" size="l" tone="primary" />
      <Text variant="caption" tone="variant">
        Living room, 48% humidity
      </Text>
    </div>
  );
}

export const climateWidget: WidgetDefinition = {
  type: 'climate',
  title: 'Climate',
  icon: 'thermometer',
  group: 'Home',
  sizes: ALL,
  defaultSize: 'M',
  render: (): ReactNode => (
    <WidgetFrame title="Climate" icon="thermometer" accent="temp-warm">
      <ClimateBody />
    </WidgetFrame>
  ),
};

export const catalogue: readonly WidgetDefinition[] = [
  climateWidget,
  {
    type: 'energy',
    title: 'Energy',
    icon: 'power',
    group: 'Home',
    sizes: ALL,
    defaultSize: 'M',
    render: (): ReactNode => (
      <WidgetFrame title="Energy" icon="power" accent="viz-1">
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
    icon: 'shield',
    group: 'Safety',
    sizes: ALL,
    defaultSize: 'M',
    render: (): ReactNode => (
      <WidgetFrame title="Security" icon="shield" accent="positive" glow="positive">
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
    icon: 'fitness',
    group: 'Health',
    sizes: ALL,
    defaultSize: 'M',
    render: (): ReactNode => (
      <WidgetFrame title="Activity" icon="fitness" accent="move">
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

const defaults: BoardDefaults = {
  compact: [
    { key: 'climate', type: 'climate', size: 'M' },
    { key: 'security', type: 'security', size: 'M' },
    { key: 'energy', type: 'energy', size: 'M' },
  ],
  medium: [
    { key: 'climate', type: 'climate', size: 'M' },
    { key: 'security', type: 'security', size: 'M' },
    { key: 'energy', type: 'energy', size: 'M' },
    { key: 'health', type: 'health', size: 'M' },
  ],
  expanded: [
    { key: 'climate', type: 'climate', size: 'M' },
    { key: 'security', type: 'security', size: 'M' },
    { key: 'energy', type: 'energy', size: 'M' },
    { key: 'health', type: 'health', size: 'M' },
  ],
};

export const available = new Set(catalogue.map((entry) => entry.type));

export function BoardDemo({ editing = false }: { readonly editing?: boolean }): ReactNode {
  const editor = useBoardEditor({
    page: 'demo',
    layout: { status: 'ready', layout: null },
    defaults,
    onSave: () => undefined,
  });
  useEffect(() => {
    if (editing) editor.begin();
  }, []);
  return <WidgetBoard editor={editor} catalogue={catalogue} available={available} />;
}
