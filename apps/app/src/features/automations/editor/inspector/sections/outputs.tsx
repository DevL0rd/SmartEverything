import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../../components/badge';
import { IconButton } from '../../../../../components/icon-button';
import { Text } from '../../../../../components/text';
import { Fold } from './fold';
import type { OutputRow } from './outputs-model';
import { outputRows } from './outputs-model';
import type { SectionProps } from './section-types';

function usedText(row: OutputRow): string | undefined {
  const used =
    row.used === 0 ? undefined : row.used === 1 ? 'Used once' : `Used ${String(row.used)} times`;
  const last = row.preview === null ? undefined : `last ${row.preview}`;
  const parts = [used, last].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' · ');
}

function Row({
  row,
  onCopy,
}: {
  readonly row: OutputRow;
  readonly onCopy: (text: string) => void;
}): ReactNode {
  const used = usedText(row);
  return (
    <View className="flex-row items-center gap-2 pl-4 pr-2">
      <View className="min-w-0 flex-1 gap-0.5 py-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="body-strong">{row.label}</Text>
          <Badge label={row.typeChip} />
          {row.optional ? (
            <Text variant="footnote" tone="variant">
              Only sometimes
            </Text>
          ) : null}
        </View>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {used === undefined ? row.description : `${row.description} ${used}.`}
        </Text>
      </View>
      <IconButton
        icon="copy"
        label={`Copy a reference to ${row.label}`}
        onPress={() => {
          onCopy(row.reference);
        }}
      />
    </View>
  );
}

function opensFirst(section: SectionProps): boolean {
  return section.view.badge !== 'Step' && section.view.badge !== 'Custom Node';
}

export function Outputs(section: SectionProps): ReactNode {
  const { view, env, actions } = section;
  const [open, setOpen] = useState(() => opensFirst(section));
  if (view.kind === undefined) return null;
  const rows = outputRows(env.index, view.kind, view.key, env.run?.outputs);
  return (
    <Fold
      title={`Gives out · ${String(rows.length)}`}
      summary={rows.map((row) => row.label).join(', ')}
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
    >
      <View className="gap-2">
        {rows.map((row) => (
          <Row key={row.name} row={row} onCopy={actions.copyReference} />
        ))}
      </View>
    </Fold>
  );
}
