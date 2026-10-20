import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../../components/badge';
import { Button } from '../../../../../components/button';
import { Section } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import type { OutputRow } from './outputs-model';
import { outputRows } from './outputs-model';
import type { SectionProps } from './section-types';

function usedText(count: number): string {
  if (count === 0) return 'Not used yet';
  return count === 1 ? 'Used once' : `Used ${String(count)} times`;
}

function Row({
  row,
  onCopy,
}: {
  readonly row: OutputRow;
  readonly onCopy: (text: string) => void;
}): ReactNode {
  return (
    <View className="gap-1 px-4 py-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="body-strong">{row.label}</Text>
        <Badge label={row.typeChip} />
        {row.optional ? (
          <Text variant="footnote" tone="variant">
            Only sometimes
          </Text>
        ) : null}
      </View>
      <Text variant="footnote" tone="variant">
        {row.description}
      </Text>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="footnote" tone="variant">
          {row.preview === null
            ? usedText(row.used)
            : `${usedText(row.used)} · last ${row.preview}`}
        </Text>
        <Button
          label="Copy reference"
          variant="text"
          icon="copy"
          onPress={() => {
            onCopy(row.reference);
          }}
        />
      </View>
    </View>
  );
}

export function Outputs({ view, env, actions }: SectionProps): ReactNode {
  if (view.kind === undefined) return null;
  const rows = outputRows(env.index, view.kind, view.key, env.run?.outputs);
  return (
    <Section title="Outputs">
      {rows.map((row) => (
        <Row key={row.name} row={row} onCopy={actions.copyReference} />
      ))}
    </Section>
  );
}
