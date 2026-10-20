import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Tap } from '../../../../components/tap';
import { Text } from '../../../../components/text';
import { treeRows, type TreeRow, type VariableSection } from './test-model';

function Row({
  row,
  onToggle,
}: {
  readonly row: TreeRow;
  readonly onToggle: () => void;
}): ReactNode {
  const body = (
    <View className="min-h-8 flex-row items-center gap-2 py-1">
      {Array.from({ length: row.depth }, (_, level) => (
        <View key={level} className="w-4" />
      ))}
      {row.open === null ? (
        <View className="size-5" />
      ) : (
        <Icon name={row.open ? 'chevronDown' : 'chevronRight'} size={20} tone="variant" />
      )}
      <Text variant="callout" className="shrink-0">
        {row.name}
      </Text>
      <Text variant="callout" tone="variant" numberOfLines={1} className="min-w-0 flex-1 tabular">
        {row.preview}
      </Text>
    </View>
  );
  if (row.open === null) return body;
  return (
    <Tap
      label={`${row.open ? 'Close' : 'Open'} ${row.name}`}
      role="button"
      className="rounded-sm"
      onPress={onToggle}
    >
      {body}
    </Tap>
  );
}

function Section({ section }: { readonly section: VariableSection }): ReactNode {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = treeRows(section.value, expanded);
  return (
    <View className="gap-1">
      <Text variant="body-strong">{section.title}</Text>
      {rows.length === 0 ? (
        <Text variant="footnote" tone="variant">
          Nothing yet.
        </Text>
      ) : (
        rows.map((row) => (
          <Row
            key={row.key}
            row={row}
            onToggle={() => {
              setExpanded((known) => {
                const next = new Set(known);
                if (!next.delete(row.key)) next.add(row.key);
                return next;
              });
            }}
          />
        ))
      )}
    </View>
  );
}

export function VariablesPane({
  sections,
}: {
  readonly sections: readonly VariableSection[];
}): ReactNode {
  return (
    <View className="gap-4">
      {sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </View>
  );
}
