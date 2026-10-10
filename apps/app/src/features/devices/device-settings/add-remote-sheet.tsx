import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { createIrRemote } from '../../../api/ir';
import type { Device } from '../../../store/state';
import { useMutationState } from '../../../store/mutation';

const CATEGORIES = [
  { value: 'tv', label: 'TV' },
  { value: 'air conditioner', label: 'Air conditioner' },
  { value: 'fan', label: 'Fan' },
  { value: 'set-top box', label: 'Set-top box' },
  { value: 'projector', label: 'Projector' },
  { value: 'audio', label: 'Audio' },
  { value: 'light', label: 'Light' },
  { value: 'other', label: 'Other' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

const NAME_MOST = 80;

interface Draft {
  readonly name: string;
  readonly brand: string;
  readonly category: Category;
}

function Fields({
  draft,
  problem,
  onChange,
  onSubmit,
}: {
  readonly draft: Draft;
  readonly problem: string | null;
  readonly onChange: (draft: Draft) => void;
  readonly onSubmit: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <TextField
        label="Name"
        placeholder="Remote name"
        value={draft.name}
        onChange={(name) => {
          onChange({ ...draft, name });
        }}
        error={problem}
        focusOnMount
      />
      <Select
        label="Kind"
        options={CATEGORIES}
        value={draft.category}
        onChange={(category) => {
          onChange({ ...draft, category });
        }}
        showLabel
      />
      <TextField
        label="Brand (optional)"
        placeholder="Brand"
        value={draft.brand}
        onChange={(brand) => {
          onChange({ ...draft, brand });
        }}
        onSubmit={onSubmit}
      />
    </View>
  );
}

export function AddRemoteSheet({
  blaster,
  onClose,
}: {
  readonly blaster: Device;
  readonly onClose: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<Draft>({ name: '', brand: '', category: 'tv' });
  const mutation = useMutationState();
  const name = draft.name.trim();
  const ready = name !== '' && name.length <= NAME_MOST;
  const add = (): void => {
    if (!ready) {
      return;
    }
    const brand = draft.brand.trim();
    mutation.run(
      () =>
        createIrRemote({
          blasterId: blaster.id,
          name,
          category: draft.category,
          brand: brand === '' ? null : brand,
        }),
      { failure: 'The remote wasn’t added', inline: true, onDone: onClose },
    );
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a remote"
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label="Add" loading={mutation.busy} disabled={!ready} onPress={add} />
        </>
      }
    >
      <Fields draft={draft} problem={mutation.problem} onChange={setDraft} onSubmit={add} />
    </Sheet>
  );
}
