import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Segmented } from '../../../../components/segmented';
import { Sheet } from '../../../../components/sheet';
import { SelectRow } from '../../../../components/rows';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import {
  canHaveDefault,
  identOf,
  typeOptions,
  type DraftIssues,
  type PortDraft,
  type Presence,
  type TypeKey,
} from './row-draft-model';
import type { EditSide } from './use-interface-panel';

export interface RowEditorProps {
  readonly side: EditSide | null;
  readonly draft: PortDraft;
  readonly issues: DraftIssues;
  readonly taken: readonly string[];
  readonly onChange: (draft: PortDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

const TITLES: Readonly<Record<EditSide, readonly [string, string]>> = {
  inputs: ['New input', 'Edit input'],
  outputs: ['New output', 'Edit output'],
  exits: ['New exit', 'Edit exit'],
};

function presenceOptions(
  side: EditSide,
  draft: PortDraft,
): readonly {
  readonly value: Presence;
  readonly label: string;
}[] {
  if (side === 'outputs') {
    return [
      { value: 'required', label: 'Always given' },
      { value: 'optional', label: 'Only sometimes' },
    ];
  }
  return [
    { value: 'required', label: 'Required' },
    { value: 'optional', label: 'Optional' },
    ...(canHaveDefault(draft.type) ? [{ value: 'default' as const, label: 'Default' }] : []),
  ];
}

function TypeFields({ side, draft, issues, onChange }: RowEditorProps): ReactNode {
  if (side === null) return null;
  return (
    <>
      <SelectRow<TypeKey>
        title="Type"
        options={typeOptions(draft)}
        value={draft.type}
        onChange={(type) => {
          const stillDefault = draft.presence !== 'default' || canHaveDefault(type);
          onChange({ ...draft, type, presence: stillDefault ? draft.presence : 'required' });
        }}
      />
      <Segmented<Presence>
        label="Presence"
        fill
        options={presenceOptions(side, draft)}
        value={draft.presence}
        onChange={(presence) => {
          onChange({ ...draft, presence });
        }}
      />
      {draft.presence === 'default' ? (
        <TextField
          label="Default value"
          value={draft.defaultText}
          error={issues.defaultValue}
          onChange={(defaultText) => {
            onChange({ ...draft, defaultText });
          }}
        />
      ) : null}
      <TextField
        label="Description"
        value={draft.description}
        multiline
        onChange={(description) => {
          onChange({ ...draft, description });
        }}
      />
    </>
  );
}

function Fields(props: RowEditorProps): ReactNode {
  const { side, draft, issues, taken, onChange } = props;
  if (side === null) return null;
  const key = draft.key ?? identOf(draft.label, taken);
  return (
    <View className="gap-3">
      <TextField
        label="Name"
        value={draft.label}
        error={issues.label}
        focusOnMount
        helper={`Key: ${key}`}
        onChange={(label) => {
          onChange({ ...draft, label });
        }}
      />
      {side === 'exits' ? null : <TypeFields {...props} />}
    </View>
  );
}

export function RowEditor(props: RowEditorProps): ReactNode {
  const { side, draft } = props;
  const title = side === null ? 'Edit' : TITLES[side][draft.key === null ? 0 : 1];
  return (
    <Sheet
      open={side !== null}
      onClose={props.onCancel}
      title={title}
      footer={
        <View className="flex-row items-center justify-end gap-2">
          <Button label="Cancel" variant="text" onPress={props.onCancel} />
          <Button label="Save" onPress={props.onSave} />
        </View>
      }
    >
      <Fields {...props} />
      {side === 'exits' ? (
        <Text variant="footnote" tone="variant">
          Return steps pick which exit the node leaves through.
        </Text>
      ) : null}
    </Sheet>
  );
}
