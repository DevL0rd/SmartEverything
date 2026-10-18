import type { ReactNode } from 'react';
import { useState } from 'react';
import type { HealthEntryRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { litres } from '../../../format/number';
import { plural } from '../../../format/text';
import { waterMlOfEntry } from '../model/portion';
import { WaterEntryRow } from './entry-rows';

export function waterSummary(entries: readonly HealthEntryRow[]): {
  readonly millilitres: number;
  readonly label: string;
} {
  const millilitres = entries.reduce((total, entry) => total + waterMlOfEntry(entry), 0);
  return {
    millilitres,
    label: `${litres(millilitres)} · ${plural(entries.length, 'glass', 'glasses')}`,
  };
}

export function WaterGroup({
  entries,
}: {
  readonly entries: readonly HealthEntryRow[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const { label } = waterSummary(entries);
  return (
    <List title="Water" inset>
      <ListRow
        icon="glassWater"
        title={label}
        trailing={<Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} tone="faint" />}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open ? entries.map((entry) => <WaterEntryRow key={entry.id} entry={entry} />) : null}
    </List>
  );
}
