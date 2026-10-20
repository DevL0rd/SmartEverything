import type { PresencePerson, RouterSnapshot } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';
import { useIsOwner } from '../../../store/selectors';
import { PluginActionRow, PluginButton } from '../../shared/plugin-action';
import { background } from '@smarteverything/logging';
import { personNameProblem } from '../client-model';
import { useRouterTools } from '../router-data';

function stateOf(person: PresencePerson): string {
  if (!person.tracked) {
    return 'Presence is off';
  }
  return person.home ? 'Home' : 'Away';
}

function PersonRow({
  person,
  editable,
}: {
  readonly person: PresencePerson;
  readonly editable: boolean;
}): ReactNode {
  const tools = useRouterTools();
  if (!editable) {
    return <ValueRow title={person.name} icon="user" value={stateOf(person)} />;
  }
  return (
    <SwitchRow
      title={person.name}
      subtitle={`${stateOf(person)} · ${String(person.devices.length)} devices`}
      icon="user"
      value={person.tracked}
      onChange={(tracked) => {
        background(
          tools.run(
            'manage_person',
            { change: { action: 'track', person: person.id, tracked } },
            'Presence wasn’t changed',
          ),
          'tools.run_failed',
        );
      }}
    />
  );
}

function AddPerson(): ReactNode {
  const tools = useRouterTools();
  const [name, setName] = useState('');
  const problem = personNameProblem(name);
  return (
    <View className="gap-2">
      <TextField
        label="Add a person by name"
        value={name}
        onChange={setName}
        helper="Then say which devices are theirs from the device list"
        error={name.trim() === '' ? null : problem}
      />
      <View className="items-start">
        <PluginButton
          label="Add person"
          disabled={problem !== null}
          onPress={async () => {
            const done = await tools.run(
              'manage_person',
              { change: { action: 'add', name: name.trim() } },
              'The person wasn’t added',
            );
            if (done !== null) {
              setName('');
            }
          }}
        />
      </View>
    </View>
  );
}

function Removals({ people }: { readonly people: readonly PresencePerson[] }): ReactNode {
  const tools = useRouterTools();
  const named = people.filter((person) => !person.profile);
  if (named.length === 0) {
    return null;
  }
  return (
    <List title="Remove a person">
      {named.map((person) => (
        <PluginActionRow
          key={person.id}
          title={`Remove ${person.name}`}
          icon="trash"
          destructive
          confirmation={{
            title: `Remove ${person.name}?`,
            body: 'Their devices stay on the network but are no longer tracked as a person.',
            confirmLabel: 'Remove',
            tone: 'destructive',
          }}
          onPress={() =>
            tools.run(
              'manage_person',
              { change: { action: 'remove', person: person.id } },
              'The person wasn’t removed',
            )
          }
        />
      ))}
    </List>
  );
}

export function PeopleManager({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const owner = useIsOwner();
  const live = snapshot.connection.state === 'online';
  const editable = owner && live;
  return (
    <View className="gap-section-gap px-gutter pb-3">
      {snapshot.people.length === 0 ? null : (
        <List title="Who the home tracks">
          {snapshot.people.map((person) => (
            <PersonRow key={person.id} person={person} editable={editable} />
          ))}
        </List>
      )}
      {editable ? <AddPerson /> : null}
      {editable ? <Removals people={snapshot.people} /> : null}
    </View>
  );
}
