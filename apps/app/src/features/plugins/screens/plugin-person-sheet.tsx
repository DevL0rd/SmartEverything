import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  PLUGIN_EXTERNAL_ID,
  type PluginOption,
  type PluginRow,
  type PluginPerson,
  type PluginPersonChange,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SwitchRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { useMutationState } from '../../../store/mutation';
import type { PluginPeopleActions } from '../data/plugin-people-actions';
import { PersonPick } from '../picker/person-pick';
import { background } from '@smarteverything/logging';

export interface PersonRequest {
  readonly person: PluginPerson | null;
  readonly row: PluginRow;
}

function idProblem(id: string): string | null {
  return id === '' || PLUGIN_EXTERNAL_ID.safeParse(id).success
    ? null
    : 'Use letters, digits and . _ : @ -';
}

interface PersonForm {
  readonly id: string;
  readonly setId: (id: string) => void;
  readonly picked: PluginOption | null;
  readonly pick: (option: PluginOption) => void;
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly owner: boolean;
  readonly setOwner: (owner: boolean) => void;
  readonly problem: string | null;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly submit: () => void;
}

function usePersonForm(
  person: PluginPerson | null,
  actions: PluginPeopleActions,
  onClose: () => void,
): PersonForm {
  const [id, setId] = useState(person?.external_id ?? '');
  const [name, setName] = useState(person?.name ?? '');
  const [owner, setOwner] = useState(person?.status === 'owner');
  const [picked, setPicked] = useState<PluginOption | null>(null);
  const mutation = useMutationState();
  const trimmedId = id.trim();
  const trimmedName = name.trim();
  const ready = trimmedId !== '' && trimmedName !== '' && idProblem(trimmedId) === null;
  const change: PluginPersonChange = { name: trimmedName, status: owner ? 'owner' : 'approved' };
  const submit = (): void => {
    if (ready) {
      mutation.run(() => actions.save(trimmedId, change), {
        failure: trimmedName,
        inline: true,
        onDone: onClose,
      });
    }
  };
  const pick = (option: PluginOption): void => {
    setPicked(option);
    setId(option.id);
    setName(option.label);
  };
  return {
    id,
    setId,
    picked,
    pick,
    name,
    setName,
    owner,
    setOwner,
    problem: idProblem(trimmedId) ?? mutation.problem,
    busy: mutation.busy,
    ready,
    submit,
  };
}

function EditorFooter({
  person,
  actions,
  form,
  onClose,
}: {
  readonly person: PluginPerson | null;
  readonly actions: PluginPeopleActions;
  readonly form: PersonForm;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      {person === null ? null : (
        <Button
          label="Remove"
          variant="destructive"
          onPress={() => {
            background(
              actions.forget(person).then((removed) => {
                if (removed) {
                  onClose();
                }
              }),
              'actions.forget_failed',
            );
          }}
        />
      )}
      <Button label="Cancel" variant="text" onPress={onClose} />
      <Button label="Save" loading={form.busy} disabled={!form.ready} onPress={form.submit} />
    </>
  );
}

function WhoField({
  request,
  form,
}: {
  readonly request: PersonRequest;
  readonly form: PersonForm;
}): ReactNode {
  const { person, row } = request;
  const source = row.manifest.contributes.peoplePicker;
  if (person === null && source !== null) {
    return <PersonPick row={row} source={source} picked={form.picked} onPick={form.pick} />;
  }
  return (
    <TextField
      label={`Their ID in ${row.manifest.name}`}
      value={form.id}
      onChange={form.setId}
      kind="code"
      disabled={person !== null}
      error={form.problem}
      focusOnMount={person === null}
    />
  );
}

function Editor({
  request,
  actions,
  onClose,
}: {
  readonly request: PersonRequest;
  readonly actions: PluginPeopleActions;
  readonly onClose: () => void;
}): ReactNode {
  const { person } = request;
  const form = usePersonForm(person, actions, onClose);
  return (
    <Sheet
      open
      onClose={onClose}
      title={person === null ? 'Add a person' : person.name}
      detents={['fit']}
      footer={<EditorFooter person={person} actions={actions} form={form} onClose={onClose} />}
    >
      <View className="gap-4">
        <WhoField request={request} form={form} />
        <TextField label="Name" value={form.name} onChange={form.setName} onSubmit={form.submit} />
        <SwitchRow
          title="This is me, the owner of this home"
          subtitle="Their messages count as yours."
          value={form.owner}
          onChange={form.setOwner}
        />
      </View>
    </Sheet>
  );
}

export function PersonSheet({
  request,
  actions,
  onClose,
}: {
  readonly request: PersonRequest | null;
  readonly actions: PluginPeopleActions;
  readonly onClose: () => void;
}): ReactNode {
  if (request === null) {
    return null;
  }
  return (
    <Editor
      key={request.person?.external_id ?? 'new'}
      request={request}
      actions={actions}
      onClose={onClose}
    />
  );
}
