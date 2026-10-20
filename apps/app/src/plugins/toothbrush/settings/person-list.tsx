import type { ReactNode } from 'react';
import { SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useProfiles } from '../../../store/people';
import { useBrushAct } from '../data/brush-act';
import { Anchored } from './anchored';
import type { SettingsProps } from './settings-props';

const NOBODY = '';

export function PersonList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const profiles = useProfiles();
  const { act } = useBrushAct(deviceId);
  if (!state.mayConfigure || profiles.length === 0) {
    return null;
  }
  return (
    <List
      inset
      title="People"
      footer="Sessions belong to this person. Other people on this server do not see them."
    >
      <Anchored deviceId={deviceId} id="person" label="Who uses this toothbrush">
        <SelectRow
          icon="user"
          title="Who uses this toothbrush"
          options={[
            { value: NOBODY, label: 'Nobody' },
            ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
          ]}
          value={settings.personId ?? NOBODY}
          onChange={(next) => {
            act(
              { action: 'set_person', personId: next === NOBODY ? null : next },
              'The person could not be changed',
            );
          }}
        />
      </Anchored>
    </List>
  );
}
