import type { ReactNode } from 'react';
import type { JsonValue, PortValue } from '@smarteverything/domain';
import { View } from 'react-native';
import { Banner } from '../../../../../components/banner';
import { Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { useValueServices } from '../values/value-services';
import { swapKindOps } from './edits';
import type { SectionProps } from './section-types';
import {
  toolSwapOf,
  toolTitle,
  toolValues,
  type ToolSwap,
  type ToolValue,
} from './tool-step-model';

function Values({ rows }: { readonly rows: readonly ToolValue[] }): ReactNode {
  if (rows.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        Nothing set yet. Add the values in More options, Edit as text.
      </Text>
    );
  }
  return rows.map((row) => (
    <View key={row.name} className="flex-row gap-3">
      <Text variant="callout" tone="variant" className="w-28">
        {row.name}
      </Text>
      <Text variant="callout" className="min-w-0 flex-1" numberOfLines={2}>
        {row.text}
      </Text>
    </View>
  ));
}

function litOf(value: PortValue | undefined): JsonValue | undefined {
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

function SwapCard({
  title,
  swap,
  section,
}: {
  readonly title: string;
  readonly swap: ToolSwap | undefined;
  readonly section: SectionProps;
}): ReactNode {
  const { view, env, actions } = section;
  if (swap === undefined || env.locked) return null;
  return (
    <Banner
      tone="info"
      title={`${title} has its own step: ${swap.name}`}
      body="It has proper fields for everything this tool needs."
      wrapBody
      action={{
        label: `Replace with ${swap.name}`,
        onPress: () => {
          actions.apply(swapKindOps(env.graph, view, swap, env.registry));
        },
      }}
    />
  );
}

export function ToolStep(section: SectionProps): ReactNode {
  const { references } = useValueServices();
  const ports = section.view.node.ports ?? {};
  const tool = litOf(ports['tool']);
  if (typeof tool !== 'string' || tool === '') return null;
  const argsPort = ports['args'];
  const args = litOf(argsPort);
  const devices = new Map(references.options('device').map((row) => [row.id, row.label]));
  return (
    <Section title="What it sends">
      <View className="gap-3 px-4 py-2">
        <SwapCard title={toolTitle(tool) ?? tool} swap={toolSwapOf(tool, args)} section={section} />
        {argsPort !== undefined && 'wire' in argsPort ? (
          <Text variant="callout">Comes from another step.</Text>
        ) : (
          <Values rows={toolValues(args, (id) => devices.get(id))} />
        )}
      </View>
    </Section>
  );
}
