import type { AdGuardTopEntry } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { decimal } from '../../format/number';

export function TopList({
  title,
  entries,
  limit,
  onPress,
}: {
  readonly title: string;
  readonly entries: readonly AdGuardTopEntry[];
  readonly limit: number;
  readonly onPress?: (name: string) => void;
}): ReactNode {
  if (entries.length === 0) {
    return null;
  }
  return (
    <List title={title}>
      {entries.slice(0, limit).map((entry) => (
        <ListRow
          key={entry.name}
          title={entry.name}
          value={decimal(entry.count)}
          {...(onPress === undefined
            ? {}
            : {
                onPress: (): void => {
                  onPress(entry.name);
                },
              })}
        />
      ))}
    </List>
  );
}
