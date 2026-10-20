import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { ListRow } from '../../../../components/list-row';
import type { LibraryRow } from './library-model';

export interface LibraryRowViewProps {
  readonly row: LibraryRow;
  readonly onOpen: (id: string) => void;
}

function Chips({ row }: { readonly row: LibraryRow }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center justify-end gap-1.5">
      {row.needsMapping ? <Badge label="Update needs mapping" tone="warning" icon="alert" /> : null}
      <Badge label={row.kindLabel} tone="neutral" />
    </View>
  );
}

export function LibraryRowView({ row, onOpen }: LibraryRowViewProps): ReactNode {
  return (
    <ListRow
      title={row.name}
      subtitle={row.interfaceLine}
      caption={`${row.usersLabel} · ${row.versionLabel}`}
      wrapSubtitle
      icon="automations"
      trailing={<Chips row={row} />}
      chevron
      label={`${row.name}. ${row.kindLabel}. ${row.interfaceLine}. ${row.usersLabel}.`}
      onPress={() => {
        onOpen(row.id);
      }}
    />
  );
}
