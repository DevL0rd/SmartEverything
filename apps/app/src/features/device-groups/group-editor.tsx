import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { DeviceGroupRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../components/button';
import { Segmented } from '../../components/segmented';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { plural } from '../../format/text';
import type { Device } from '../../store/state';
import { ArrangeList } from './arrange-list';
import { useGroupDraft, type EditorResult, type GroupDraft } from './data/use-group-draft';
import { MemberPicker } from './member-picker';

type Step = 'choose' | 'arrange';

interface Props {
  readonly group: DeviceGroupRow | null;
  readonly devices: readonly Device[];
  readonly initialMembers?: readonly string[];
  readonly automations?: readonly string[];
  readonly onClose: (result: EditorResult) => void;
}

const CANCELLED: EditorResult = { kind: 'cancelled' };

function Footer({
  draft,
  editing,
  onClose,
}: {
  readonly draft: GroupDraft;
  readonly editing: boolean;
  readonly onClose: (result: EditorResult) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="footnote" tone="variant">
          {`${plural(draft.members.length, 'device')} selected`}
        </Text>
        {editing ? (
          <Button
            label="Remove group"
            variant="destructive"
            icon="trash"
            disabled={draft.busy}
            onPress={() => {
              background(draft.remove(), 'draft.remove_failed');
            }}
          />
        ) : null}
      </View>
      <View className="flex-row justify-end gap-2">
        <Button
          label="Cancel"
          variant="tonal"
          disabled={draft.busy}
          onPress={() => {
            onClose(CANCELLED);
          }}
        />
        <Button
          label="Save"
          loading={draft.busy}
          disabled={!draft.valid || draft.busy}
          onPress={() => {
            background(draft.save(), 'draft.save_failed');
          }}
        />
      </View>
    </View>
  );
}

function Steps({
  step,
  draft,
  devices,
  onStep,
}: {
  readonly step: Step;
  readonly draft: GroupDraft;
  readonly devices: readonly Device[];
  readonly onStep: (step: Step) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <View className="flex-row">
        <Segmented
          label="Editor step"
          value={step}
          onChange={onStep}
          options={[
            { value: 'choose', label: 'Choose' },
            { value: 'arrange', label: `Arrange (${String(draft.members.length)})` },
          ]}
        />
      </View>
      {step === 'choose' ? (
        <MemberPicker
          devices={devices}
          members={draft.members}
          busy={draft.busy}
          onChange={draft.setMembers}
        />
      ) : (
        <ArrangeList devices={devices} members={draft.members} onChange={draft.setMembers} />
      )}
    </View>
  );
}

export function GroupEditor({
  group,
  devices,
  initialMembers = [],
  automations = [],
  onClose,
}: Props): ReactNode {
  const draft = useGroupDraft({ group, initialMembers, automations, onClose });
  const [step, setStep] = useState<Step>('choose');
  const close = (): void => {
    onClose(CANCELLED);
  };
  return (
    <Sheet
      detents={['full']}
      open
      title={group === null ? 'New group' : 'Edit group'}
      onClose={close}
      footer={<Footer draft={draft} editing={group !== null} onClose={onClose} />}
    >
      <View className="gap-3">
        <TextField
          label="Name"
          value={draft.name}
          onChange={draft.setName}
          disabled={draft.busy}
          error={draft.error}
          focusOnMount={group === null}
        />
        <Steps step={step} draft={draft} devices={devices} onStep={setStep} />
      </View>
    </Sheet>
  );
}
