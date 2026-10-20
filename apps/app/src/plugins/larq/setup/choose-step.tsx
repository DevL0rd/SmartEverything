import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useProfiles } from '../../../store/people';
import { useRooms } from '../../../store/selectors';
import { BodyPicker } from '../settings/body-picker';
import { PICKER_LINE, type SetupEvent, type SetupState } from './setup-model';
import type { Setup } from './use-setup';

const NOBODY = '';

function Whose({
  state,
  dispatch,
}: {
  readonly state: SetupState;
  readonly dispatch: (event: SetupEvent) => void;
}): ReactNode {
  const profiles = useProfiles();
  return (
    <List inset title="Whose drinks" footer={PICKER_LINE}>
      <SelectRow
        icon="user"
        title="Whose drinks"
        options={[
          { value: NOBODY, label: 'Nobody yet' },
          ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
        ]}
        value={state.personId ?? NOBODY}
        onChange={(id) => {
          dispatch({ type: 'person', personId: id === NOBODY ? null : id });
        }}
      />
    </List>
  );
}

function Options({ setup }: { readonly setup: Setup }): ReactNode {
  const rooms = useRooms();
  const { state, dispatch, form } = setup;
  return (
    <List inset>
      <SwitchRow
        icon="filter"
        title="I use a filter pod"
        subtitle="Counts its litres and days"
        value={state.filter}
        onChange={(filter) => {
          dispatch({ type: 'filter', filter });
        }}
      />
      <SelectRow
        icon="door"
        title="Room"
        options={[
          { value: '', label: 'No room' },
          ...rooms.map((room) => ({ value: room.name, label: room.name })),
        ]}
        value={form.room}
        onChange={setup.setRoom}
      />
    </List>
  );
}

export function ChooseStep({ setup }: { readonly setup: Setup }): ReactNode {
  const { state, dispatch, form } = setup;
  return (
    <View className="gap-4">
      <TextField
        label="Name"
        value={form.name}
        onChange={setup.setName}
        placeholder="Water bottle"
      />
      <Whose state={state} dispatch={dispatch} />
      <List inset title="Bottle size">
        <BodyPicker
          value={state.body}
          disabled={false}
          onChange={(body) => {
            dispatch({ type: 'body', body });
          }}
        />
      </List>
      <Options setup={setup} />
      <Text variant="footnote" tone="variant">
        The first sync brings in the drinks the cap has kept.
      </Text>
      {setup.add.problem === null ? null : (
        <Banner
          tone="critical"
          title="Could not add the bottle"
          body={setup.add.problem}
          wrapBody
        />
      )}
    </View>
  );
}
