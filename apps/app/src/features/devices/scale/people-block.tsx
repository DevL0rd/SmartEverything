import { useState, type ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { kilograms } from '../../../format/number';
import { useProfiles } from '../../../store/people';
import { AssignSheet } from './assign-sheet';
import { targetOfPending } from './assign-model';
import { readingsLabel } from './card-model';
import { peopleRows } from './people-rows';
import type { Scale } from './use-scale';

const WHO_IS_WHO =
  'Each person has a slot on the scale. Step on it and the right person is picked.';

export function PeopleBlock({ scale }: { readonly scale: Scale }): ReactNode {
  const profiles = useProfiles();
  const [queue, setQueue] = useState(false);
  const rows = peopleRows(profiles, scale.people);
  const waiting = scale.pending.length;
  if (rows.length === 0 && waiting === 0) {
    return null;
  }
  return (
    <>
      <List title="People on this scale" footer={WHO_IS_WHO}>
        {rows.map((row) => (
          <ListRow
            key={row.profile.id}
            title={row.profile.name}
            subtitle={row.slot}
            icon="user"
            {...(row.last === null
              ? {}
              : { value: `${kilograms(row.last.kg)} · ${scale.when(row.last.iso, false)}` })}
          />
        ))}
        {waiting === 0 ? null : (
          <ListRow
            title="Someone else"
            subtitle={readingsLabel(waiting)}
            subtitleTone="warning"
            icon="users"
            iconTone="warning"
            chevron
            onPress={() => {
              setQueue(true);
            }}
          />
        )}
      </List>
      {queue ? (
        <AssignSheet
          queue={scale.pending.map(targetOfPending)}
          onClose={() => {
            setQueue(false);
          }}
        />
      ) : null}
    </>
  );
}
