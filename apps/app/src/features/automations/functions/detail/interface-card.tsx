import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Card } from '../../../../components/card';
import { Text } from '../../../../components/text';
import type { ExitLine, InterfaceCardModel, PortLine } from './detail-model';
import { KEPT_TITLE } from '../edit/kept-model';

function PortRow({ line }: { readonly line: PortLine }): ReactNode {
  return (
    <View className="min-h-touch-min gap-0.5 border-b border-outline-variant py-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="body-strong">{line.title}</Text>
        <Badge label={line.typeText} tone="neutral" />
        <Badge label={line.requirement} tone="primary" />
      </View>
      {line.description === null ? null : (
        <Text variant="footnote" tone="variant">
          {line.description}
        </Text>
      )}
    </View>
  );
}

function Group({
  title,
  empty,
  lines,
}: {
  readonly title: string;
  readonly empty: string;
  readonly lines: readonly PortLine[];
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        {title}
      </Text>
      {lines.length === 0 ? (
        <Text variant="callout" tone="variant">
          {empty}
        </Text>
      ) : (
        lines.map((line) => <PortRow key={line.name} line={line} />)
      )}
    </View>
  );
}

function Exits({ exits }: { readonly exits: readonly ExitLine[] }): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        Exits
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {exits.map((exit) => (
          <Badge key={exit.name} label={exit.name} tone="info" icon="check" />
        ))}
      </View>
    </View>
  );
}

export function InterfaceCard({
  model,
  kept,
}: {
  readonly model: InterfaceCardModel;
  readonly kept: readonly PortLine[];
}): ReactNode {
  return (
    <Card title="Interface" icon="automations">
      <View className="gap-4">
        <Group title="Inputs" empty="Takes nothing in." lines={model.inputs} />
        <Group title="Outputs" empty="Gives nothing back." lines={model.outputs} />
        <Exits exits={model.exits} />
        <Group title={KEPT_TITLE} empty="Keeps nothing between runs." lines={kept} />
      </View>
    </Card>
  );
}
